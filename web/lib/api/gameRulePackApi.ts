import { ZodError } from "zod";
import { getGameRulePackRegistry, type GameRulePackRegistry } from "@/lib/gameRulePacks/registry";
import {
  createGameRulePackService,
  GameRulePackServiceError,
  type GameRulePackGatewayPort,
} from "@/lib/gameRulePacks/service";
import { getPluginCapabilityGateway, PluginCapabilityGatewayError } from "@/lib/plugins/capabilityGateway";
import { PluginCapabilityRepositoryError } from "@/lib/repositories/pluginCapabilityRepository";
import { PluginStorageRepositoryError } from "@/lib/repositories/pluginStorageRepository";

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  });
}

export function createGameRulePackApi(
  gatewayOrFactory: GameRulePackGatewayPort | (() => GameRulePackGatewayPort),
  registry: GameRulePackRegistry = getGameRulePackRegistry(),
) {
  const service = createGameRulePackService(registry, gatewayOrFactory);
  const handle = async (operation: (requestId: string) => Promise<Response>) => {
    const requestId = crypto.randomUUID();
    try {
      return await operation(requestId);
    } catch (error) {
      let status = 500;
      let code = "INTERNAL_ERROR";
      let message = "服务端无法完成娱乐规则包请求。";
      if (error instanceof ZodError) {
        status = 400;
        code = "INVALID_REQUEST";
        message = "规则包配置格式无效，请检查填写内容。";
      } else if (
        error instanceof GameRulePackServiceError ||
        error instanceof PluginCapabilityGatewayError ||
        error instanceof PluginCapabilityRepositoryError ||
        error instanceof PluginStorageRepositoryError
      ) {
        code = error.code;
        message = error.message;
        if (code.endsWith("NOT_FOUND")) status = 404;
        else if (["PLUGIN_DISABLED", "PLUGIN_INCOMPATIBLE", "CAPABILITY_NOT_DECLARED", "CAPABILITY_NOT_GRANTED", "PLUGIN_UPDATE_REVIEW_REQUIRED", "CAPABILITY_REVIEW_REQUIRED"].includes(code)) status = 403;
        else if (code === "CAPABILITY_QUOTA_EXCEEDED") status = 429;
        else if (code.includes("VERSION_CONFLICT") || code === "GAME_RULE_PACK_SETUP_INVALID") status = 409;
        else if (code.startsWith("CAPABILITY_INPUT") || code.startsWith("CAPABILITY_CONTEXT")) status = 400;
      }
      if (status === 500) {
        // Adapter/storage details may contain configuration data; keep them out of the response.
        code = "INTERNAL_ERROR";
        message = "服务端无法完成娱乐规则包请求。";
        console.error(`[api:${requestId}] Game rule pack API failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
      return response(requestId, {
        error: { code, message, retryable: status === 500 || status === 429, requestId },
      }, status);
    }
  };
  return {
    getSetup: (id: string) => handle(async (requestId) =>
      response(requestId, { data: await service.getSetup(id) })),
    prepareDraft: (id: string, request: Request) => handle(async (requestId) => {
      let input: unknown;
      try { input = await request.json(); }
      catch {
        return response(requestId, {
          error: { code: "INVALID_JSON", message: "请求必须是有效 JSON。", retryable: false, requestId },
        }, 400);
      }
      return response(requestId, { data: await service.prepareDraft(id, input) });
    }),
  };
}

export function getGameRulePackApi() {
  return createGameRulePackApi(() => getPluginCapabilityGateway());
}
