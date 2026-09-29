import { z } from "zod";
import { PLUGIN_CAPABILITY_IDS } from "@/lib/plugins/capabilityCatalog";

export const HOST_PLUGIN_API_VERSION = "1.0.0" as const;
export const FIRST_PARTY_PLUGIN_API_RANGE = ">=1.0.0 <2.0.0" as const;

export const pluginContributionIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

export const pluginExecutionContextSchema = z
  .object({
    execution: z.enum(["foreground", "background"]),
    runId: z.string().trim().min(1).max(120).nullable(),
    userInitiated: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.execution === "background" && !value.runId) {
      context.addIssue({
        code: "custom",
        path: ["runId"],
        message: "Background capability calls require a run id.",
      });
    }
    if (value.execution === "foreground" && !value.userInitiated) {
      context.addIssue({
        code: "custom",
        path: ["userInitiated"],
        message: "Foreground capability calls must follow a user action.",
      });
    }
  });

export type PluginExecutionContext = z.infer<typeof pluginExecutionContextSchema>;

export const USER_INITIATED_PLUGIN_CONTEXT: PluginExecutionContext = Object.freeze({
  execution: "foreground",
  runId: null,
  userInitiated: true,
});

export const pluginStorageRequestSchema = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("get"), key: z.string() }).strict(),
  z.object({
    operation: z.literal("list"),
    prefix: z.string().default(""),
    limit: z.number().int().min(1).max(100).default(50),
  }).strict(),
  z.object({
    operation: z.literal("set"),
    key: z.string(),
    value: z.unknown().refine((value) => value !== undefined, "Storage value is required."),
    expectedVersion: z.number().int().min(0),
  }).strict(),
  z.object({
    operation: z.literal("delete"),
    key: z.string(),
    expectedVersion: z.number().int().min(1),
  }).strict(),
]);

export const pluginStorageEntrySchema = z
  .object({
    key: z.string(),
    value: z.unknown().refine((value) => value !== undefined, "Storage value is required."),
    byteSize: z.number().int().nonnegative(),
    version: z.number().int().positive(),
    updatedAt: z.coerce.date(),
  })
  .strict();

export const pluginModelGenerateRequestSchema = z
  .object({
    operation: pluginContributionIdSchema,
    input: z.unknown().refine((value) => value !== undefined, "Model operation input is required."),
  })
  .strict();

export const pluginTaskDraftRequestSchema = z
  .object({
    intent: z.literal("review"),
    activityId: pluginContributionIdSchema,
    title: z.string().trim().min(1).max(120),
    prompt: z.string().trim().min(1).max(10_000),
    runAt: z.string().datetime(),
  })
  .strict();

export const taskDraftResultSchema = z
  .object({
    title: z.string(),
    kind: z.literal("reminder"),
    prompt: z.string(),
    schedule: z.object({ type: z.literal("once"), runAt: z.string().datetime() }),
  })
  .strict();

export const learningCardContentSchema = z
  .object({
    front: z.string().trim().min(1).max(600),
    back: z.string().trim().min(1).max(2_000),
    reason: z.string().trim().min(1).max(500),
    tags: z.array(z.string().trim().min(1).max(80)).max(6),
  })
  .strict();

export const learningCardDraftSchema = z
  .object({
    schemaVersion: z.literal(1),
    source: z.object({
      pluginId: pluginContributionIdSchema,
      activityId: pluginContributionIdSchema,
      recordId: z.string().trim().min(1).max(120),
    }).strict(),
    content: learningCardContentSchema,
  })
  .strict();

export const PLUGIN_API_V1_CONTRACT = Object.freeze({
  version: HOST_PLUGIN_API_VERSION,
  manifestSchemaVersion: "1",
  capabilities: Object.freeze([...PLUGIN_CAPABILITY_IDS]),
  modelDispatch: "registered-operation",
  taskWrites: "draft-only",
  crossPluginData: "host-contract-only",
  activityUi: "precompiled-host-registry",
} as const);
