import { z } from "zod";
import { createGameSessionSchema } from "@/lib/game/contracts";
import { pluginContributionIdSchema } from "@/lib/plugins/pluginApiV1";

const versionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);

export const gameRulePackDescriptorSchema = z.object({
  id: pluginContributionIdSchema,
  pluginId: pluginContributionIdSchema,
  activityId: pluginContributionIdSchema,
  version: versionSchema,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(500),
  promptLayer: z.array(z.string().trim().min(1).max(300)).min(1).max(12),
  hostContracts: z.object({
    tools: z.array(z.enum(["dice.roll.v1", "rule-check.v1"])).min(1).max(2),
    state: z.literal("game-state.v2"),
    stateFields: z.array(z.enum([
      "scene", "sceneFacts", "sceneExits", "objectives", "flags",
      "resources", "inventory", "characters", "items",
    ])).min(1).max(9),
  }).strict(),
}).strict();

export const gameSessionDraftSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({
    pluginId: pluginContributionIdSchema,
    activityId: pluginContributionIdSchema,
    rulePackId: pluginContributionIdSchema,
    rulePackVersion: versionSchema,
  }).strict(),
  session: createGameSessionSchema,
}).strict();

export const prepareGameRulePackDraftSchema = z.object({
  setup: z.unknown().refine((value) => value !== undefined, "Setup is required."),
  expectedVersion: z.number().int().nonnegative(),
}).strict();

export const gameRulePackSetupResultSchema = z.object({
  setup: z.unknown().refine((value) => value !== undefined, "Setup is required."),
  storageVersion: z.number().int().nonnegative(),
}).strict();

export const gameRulePackDraftResultSchema = z.object({
  draft: gameSessionDraftSchema,
  storageVersion: z.number().int().positive(),
}).strict();

export type GameRulePackDescriptor = z.infer<typeof gameRulePackDescriptorSchema>;
export type GameSessionDraft = z.infer<typeof gameSessionDraftSchema>;
export type GameRulePackSetupResult = z.infer<typeof gameRulePackSetupResultSchema>;
export type GameRulePackDraftResult = z.infer<typeof gameRulePackDraftResultSchema>;
