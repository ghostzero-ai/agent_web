import { z, ZodError } from "zod";
import {
  PluginCapabilityGatewayError,
  getPluginCapabilityGateway,
} from "@/lib/plugins/capabilityGateway";
import { PluginCapabilityRepositoryError } from "@/lib/repositories/pluginCapabilityRepository";
import { PluginStorageRepositoryError } from "@/lib/repositories/pluginStorageRepository";
import {
  createProblemSolvingService,
  ProblemSolvingServiceError,
  type ProblemGatewayPort,
} from "@/lib/problemSolving/service";

const idSchema = z.string().uuid();

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  });
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error
    ? String((error as Error & { code: unknown }).code)
    : "";
}

function statusFor(error: unknown): number {
  const code = errorCode(error);
  if (["ATTEMPT_NOT_FOUND", "REVIEW_CARD_NOT_FOUND"].includes(code)) return 404;
  if ([
    "PLUGIN_DISABLED",
    "CAPABILITY_NOT_GRANTED",
    "PLUGIN_UPDATE_REVIEW_REQUIRED",
    "CAPABILITY_REVIEW_REQUIRED",
  ].includes(code)) return 403;
  if (code.includes("VERSION_CONFLICT") || code.endsWith("LIMIT_REACHED")) return 409;
  if (error instanceof ZodError || code.startsWith("IMAGE_") || code.startsWith("CAPABILITY_INPUT")) return 400;
  return 500;
}

function publicError(error: unknown) {
  if (error instanceof ZodError) {
    return { code: "INVALID_REQUEST", message: "请求内容不符合解题训练格式。", retryable: false };
  }
  if (
    error instanceof PluginCapabilityGatewayError ||
    error instanceof PluginCapabilityRepositoryError ||
    error instanceof PluginStorageRepositoryError ||
    error instanceof ProblemSolvingServiceError
  ) {
    return { code: error.code, message: error.message, retryable: false };
  }
  return { code: "INTERNAL_ERROR", message: "服务端无法完成解题训练请求。", retryable: true };
}

async function body(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ZodError([{ code: "custom", path: [], message: "Invalid JSON" }]);
  }
}

export function createProblemSolvingApi(
  gatewayOrFactory: ProblemGatewayPort | (() => ProblemGatewayPort),
  now: () => Date = () => new Date(),
) {
  const service = createProblemSolvingService(gatewayOrFactory, now);
  const handle = async (operation: (requestId: string) => Promise<Response>) => {
    const requestId = crypto.randomUUID();
    try {
      return await operation(requestId);
    } catch (error) {
      const status = statusFor(error);
      if (status === 500) {
        console.error(`[api:${requestId}] Problem-solving API failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
      return response(requestId, { error: { ...publicError(error), requestId } }, status);
    }
  };

  const missing = (requestId: string) => response(requestId, {
    error: {
      code: "PROBLEM_NOT_FOUND",
      message: "题目记录不存在。",
      retryable: false,
      requestId,
    },
  }, 404);

  return {
    list: () => handle(async (requestId) => response(requestId, { data: await service.list() })),
    create: (request: Request) => handle(async (requestId) =>
      response(requestId, { data: await service.create(await body(request)) }, 201)),
    get: (id: string) => handle(async (requestId) => {
      const result = await service.get(idSchema.parse(id));
      return result ? response(requestId, { data: result }) : missing(requestId);
    }),
    delete: (id: string, request: Request) => handle(async (requestId) => {
      await service.delete(idSchema.parse(id), await body(request));
      return new Response(null, {
        status: 204,
        headers: { "cache-control": "no-store", "x-request-id": requestId },
      });
    }),
    respond: (id: string, request: Request) => handle(async (requestId) => {
      const result = await service.respond(idSchema.parse(id), await body(request));
      return result ? response(requestId, { data: result }) : missing(requestId);
    }),
    createReviewCard: (id: string, request: Request) => handle(async (requestId) => {
      const result = await service.createReviewCard(idSchema.parse(id), await body(request));
      return result ? response(requestId, { data: result }, 201) : missing(requestId);
    }),
    createTaskDraft: (id: string, request: Request) => handle(async (requestId) => {
      const result = await service.createTaskDraft(idSchema.parse(id), await body(request));
      return result ? response(requestId, { data: result }) : missing(requestId);
    }),
  };
}

export function getProblemSolvingApi() {
  return createProblemSolvingApi(() => getPluginCapabilityGateway());
}
