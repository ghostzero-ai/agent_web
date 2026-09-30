import { z } from "zod";
import {
  prepareGameRulePackDraftSchema,
  gameRulePackSetupResultSchema,
  type GameRulePackDraftResult,
  type GameRulePackSetupResult,
} from "@/lib/gameRulePacks/contracts";
import type { GameRulePackRegistry } from "@/lib/gameRulePacks/registry";
import type { PluginCapabilityGateway } from "@/lib/plugins/capabilityGateway";
import { pluginStorageEntrySchema, USER_INITIATED_PLUGIN_CONTEXT } from "@/lib/plugins/pluginApiV1";

const SETUP_KEY = "rule-pack/setup";
const storedSetupSchema = z.object({
  schemaVersion: z.literal(1),
  rulePackId: z.string(),
  rulePackVersion: z.string(),
  setup: z.unknown(),
}).strict();

export class GameRulePackServiceError extends Error {
  constructor(
    readonly code: "GAME_RULE_PACK_NOT_FOUND" | "GAME_RULE_PACK_SETUP_INVALID",
    message: string,
  ) {
    super(message);
    this.name = "GameRulePackServiceError";
  }
}

export type GameRulePackGatewayPort = Pick<PluginCapabilityGateway, "invoke">;

export function createGameRulePackService(
  registry: GameRulePackRegistry,
  gatewayOrFactory: GameRulePackGatewayPort | (() => GameRulePackGatewayPort),
) {
  const gateway = () => typeof gatewayOrFactory === "function"
    ? gatewayOrFactory() : gatewayOrFactory;
  const requirePack = (id: string) => {
    const pack = registry.get(id);
    if (!pack) {
      throw new GameRulePackServiceError("GAME_RULE_PACK_NOT_FOUND", "娱乐规则包不存在。");
    }
    return pack;
  };
  const storage = async (id: string, payload: unknown) => {
    const pack = requirePack(id);
    return (await gateway().invoke({
      pluginId: pack.descriptor.pluginId,
      capabilityId: "storage.read-write",
      payload,
      context: USER_INITIATED_PLUGIN_CONTEXT,
    })).data;
  };
  const key = (id: string) => `${SETUP_KEY}/${id}`;

  return {
    async getSetup(id: string): Promise<GameRulePackSetupResult> {
      const pack = requirePack(id);
      const value = await storage(id, { operation: "get", key: key(id) });
      if (value === null) return { setup: null, storageVersion: 0 };
      try {
        const entry = pluginStorageEntrySchema.parse(value);
        const record = storedSetupSchema.parse(entry.value);
        if (record.rulePackId !== id) throw new Error("Stored rule pack identity mismatch.");
        return gameRulePackSetupResultSchema.parse({
          setup: pack.parseSetup(record.setup), storageVersion: entry.version,
        });
      } catch {
        throw new GameRulePackServiceError(
          "GAME_RULE_PACK_SETUP_INVALID", "保存的规则包配置与当前版本不兼容，请保留原数据并检查升级说明。",
        );
      }
    },

    async prepareDraft(id: string, rawInput: unknown): Promise<GameRulePackDraftResult> {
      const pack = requirePack(id);
      const input = prepareGameRulePackDraftSchema.parse(rawInput);
      const setup = pack.parseSetup(input.setup);
      // Validate the entire host draft before persisting even the plugin's setup.
      const draft = registry.buildDraft(id, setup);
      const entry = pluginStorageEntrySchema.parse(await storage(id, {
        operation: "set",
        key: key(id),
        value: {
          schemaVersion: 1,
          rulePackId: id,
          rulePackVersion: pack.descriptor.version,
          setup,
        },
        expectedVersion: input.expectedVersion,
      }));
      return { draft, storageVersion: entry.version };
    },
  };
}
