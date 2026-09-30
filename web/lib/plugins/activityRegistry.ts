import { z } from "zod";
import { pluginContributionIdSchema } from "@/lib/plugins/pluginApiV1";

const activityDefinitionSchema = z
  .object({
    id: pluginContributionIdSchema,
    pluginId: pluginContributionIdSchema,
    route: z.string().regex(/^\/(?:study|entertainment)\/[a-z0-9-]+$/),
    label: z.string().trim().min(1).max(80),
    platforms: z.array(z.enum(["web", "android"])).min(1),
  })
  .strict();

export type PluginActivityDefinition = z.infer<typeof activityDefinitionSchema>;

export const FIRST_PARTY_PLUGIN_ACTIVITIES: readonly PluginActivityDefinition[] =
  z.array(activityDefinitionSchema).parse([
    {
      id: "memorization.review",
      pluginId: "study.memorization",
      route: "/study/memorization",
      label: "打开背书训练",
      platforms: ["web", "android"],
    },
    {
      id: "problem-solving.practice",
      pluginId: "study.problem-solving",
      route: "/study/problem-solving",
      label: "打开解题训练",
      platforms: ["web", "android"],
    },
    {
      id: "quick-adventure.setup",
      pluginId: "entertainment.quick-adventure",
      route: "/entertainment/quick-adventure",
      label: "打开轻量冒险",
      platforms: ["web", "android"],
    },
  ]);

const byId = new Map(
  FIRST_PARTY_PLUGIN_ACTIVITIES.map((activity) => [activity.id, activity]),
);

if (byId.size !== FIRST_PARTY_PLUGIN_ACTIVITIES.length) {
  throw new Error("Duplicate first-party plugin activity id.");
}

export function hasValidActivityContributions(
  pluginId: string,
  activityIds: readonly string[],
): boolean {
  const registeredIds = FIRST_PARTY_PLUGIN_ACTIVITIES
    .filter((activity) => activity.pluginId === pluginId)
    .map((activity) => activity.id);
  return registeredIds.length === activityIds.length &&
    activityIds.every((id) => registeredIds.includes(id));
}

export function ownsRegisteredActivity(
  pluginId: string,
  activityId: string,
): boolean {
  return byId.get(activityId)?.pluginId === pluginId;
}

export function listPluginActivities(
  pluginId: string,
  declaredActivityIds: readonly string[],
): PluginActivityDefinition[] {
  return declaredActivityIds.flatMap((id) => {
    const activity = byId.get(id);
    return activity?.pluginId === pluginId ? [activity] : [];
  });
}
