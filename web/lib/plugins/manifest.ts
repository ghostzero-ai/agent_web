import { z } from "zod";
import { pluginCapabilityIdSchema } from "@/lib/plugins/capabilityCatalog";

export const PLUGIN_MANIFEST_SCHEMA_VERSION = "1" as const;
export const HOST_PLUGIN_API_VERSION = "0.1.0" as const;

const SEMVER_SOURCE = "(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)\\.(?:0|[1-9]\\d*)";
const SEMVER_PATTERN = new RegExp(`^${SEMVER_SOURCE}$`);
const API_RANGE_PATTERN = new RegExp(`^>=(${SEMVER_SOURCE}) <(${SEMVER_SOURCE})$`);
const identifier = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export const pluginManifestSchema = z
  .object({
    schemaVersion: z.literal(PLUGIN_MANIFEST_SCHEMA_VERSION),
    id: identifier,
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().min(1).max(400),
    version: z.string().regex(SEMVER_PATTERN),
    pluginApiVersion: z.string().regex(API_RANGE_PATTERN),
    kind: z.enum(["skill", "tool", "activity", "connector"]),
    source: z.literal("first-party"),
    availability: z.enum(["foundation", "available"]),
    contributions: z
      .object({
        skills: z.array(identifier).max(20).default([]),
        tools: z.array(identifier).max(20).default([]),
        activities: z.array(identifier).max(20).default([]),
        backgroundJobs: z.array(identifier).max(20).default([]),
      })
      .strict()
      .superRefine((value, context) => {
        for (const [key, identifiers] of Object.entries(value)) {
          if (!unique(identifiers)) {
            context.addIssue({
              code: "custom",
              message: `${key} must not contain duplicate identifiers.`,
              path: [key],
            });
          }
        }
      }),
    requestedCapabilities: z
      .array(pluginCapabilityIdSchema)
      .max(30)
      .refine(unique, "Capabilities must not contain duplicates."),
  })
  .strict();

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

type Version = { major: number; minor: number; patch: number };

function parseVersion(value: string): Version | null {
  if (!SEMVER_PATTERN.test(value)) return null;
  const [major, minor, patch] = value.split(".").map(Number);
  return {
    major,
    minor,
    patch,
  };
}

function compareVersions(left: Version, right: Version): number {
  return (
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  );
}

export function checkPluginCompatibility(
  manifest: PluginManifest,
  hostApiVersion: string = HOST_PLUGIN_API_VERSION,
): { compatible: true } | { compatible: false; reason: string } {
  const host = parseVersion(hostApiVersion);
  const range = API_RANGE_PATTERN.exec(manifest.pluginApiVersion);
  const minimum = range ? parseVersion(range[1]) : null;
  const maximum = range ? parseVersion(range[2]) : null;
  if (!host || !minimum || !maximum || compareVersions(minimum, maximum) >= 0) {
    return {
      compatible: false,
      reason: "插件 API 版本范围无效，已安全停用。",
    };
  }
  if (
    compareVersions(host, minimum) < 0 ||
    compareVersions(host, maximum) >= 0
  ) {
    return {
      compatible: false,
      reason: `需要 Plugin API ${manifest.pluginApiVersion}，当前宿主为 ${hostApiVersion}。`,
    };
  }
  return { compatible: true };
}
