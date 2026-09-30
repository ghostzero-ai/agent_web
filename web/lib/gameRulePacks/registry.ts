import type { CreateGameSessionRequest } from "@/lib/game/contracts";
import {
  gameRulePackDescriptorSchema,
  gameSessionDraftSchema,
  type GameRulePackDescriptor,
  type GameSessionDraft,
} from "@/lib/gameRulePacks/contracts";
import {
  buildQuickAdventureSession,
  QUICK_ADVENTURE_DESCRIPTOR,
  quickAdventureSetupSchema,
} from "@/lib/gameRulePacks/quickAdventure";
import { ownsRegisteredActivity } from "@/lib/plugins/activityRegistry";
import { getFirstPartyPluginRegistry, type PluginRegistry } from "@/lib/plugins/pluginRegistry";

export type GameRulePackDefinition = {
  descriptor: GameRulePackDescriptor;
  parseSetup(input: unknown): unknown;
  buildSession(setup: unknown): CreateGameSessionRequest;
};

export class GameRulePackRegistry {
  private readonly packs = new Map<string, GameRulePackDefinition>();

  constructor(definitions: readonly GameRulePackDefinition[], plugins: PluginRegistry) {
    for (const definition of definitions) {
      const descriptor = gameRulePackDescriptorSchema.parse(definition.descriptor);
      const plugin = plugins.get(descriptor.pluginId);
      if (!plugin || plugin.manifest.version !== descriptor.version ||
          !plugin.manifest.contributions.activities.includes(descriptor.activityId) ||
          !plugin.manifest.requestedCapabilities.includes("storage.read-write") ||
          !ownsRegisteredActivity(descriptor.pluginId, descriptor.activityId)) {
        throw new Error(`Rule pack must belong to a registered plugin activity: ${descriptor.id}`);
      }
      if (this.packs.has(descriptor.id)) {
        throw new Error(`Duplicate game rule pack: ${descriptor.id}`);
      }
      this.packs.set(descriptor.id, { ...definition, descriptor });
    }
  }

  get(id: string): GameRulePackDefinition | undefined {
    return this.packs.get(id);
  }

  buildDraft(id: string, setup: unknown): GameSessionDraft {
    const pack = this.packs.get(id);
    if (!pack) throw new Error("Game rule pack is not registered.");
    return gameSessionDraftSchema.parse({
      schemaVersion: 1,
      source: {
        pluginId: pack.descriptor.pluginId,
        activityId: pack.descriptor.activityId,
        rulePackId: pack.descriptor.id,
        rulePackVersion: pack.descriptor.version,
      },
      session: pack.buildSession(pack.parseSetup(setup)),
    });
  }
}

export function getGameRulePackRegistry(): GameRulePackRegistry {
  return new GameRulePackRegistry([
    {
      descriptor: QUICK_ADVENTURE_DESCRIPTOR,
      parseSetup: (input) => quickAdventureSetupSchema.parse(input),
      buildSession: buildQuickAdventureSession,
    },
  ], getFirstPartyPluginRegistry());
}
