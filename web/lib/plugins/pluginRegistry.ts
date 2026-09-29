import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";
import { hasValidActivityContributions } from "@/lib/plugins/activityRegistry";
import {
  HOST_PLUGIN_API_VERSION,
  checkPluginCompatibility,
  pluginManifestSchema,
  type PluginManifest,
} from "@/lib/plugins/manifest";

export type RegisteredPlugin = {
  manifest: PluginManifest;
  compatibility:
    | { status: "compatible"; hostApiVersion: string; reason: null }
    | { status: "incompatible"; hostApiVersion: string; reason: string };
};

export type RejectedPluginManifest = {
  sourceIndex: number;
  code:
    | "INVALID_MANIFEST"
    | "DUPLICATE_PLUGIN_ID"
    | "INVALID_ACTIVITY_CONTRIBUTION";
};

export interface PluginRegistryPort {
  list(): readonly RegisteredPlugin[];
  get(pluginId: string): RegisteredPlugin | null;
}

export class PluginRegistry implements PluginRegistryPort {
  private readonly plugins = new Map<string, RegisteredPlugin>();
  readonly rejected: readonly RejectedPluginManifest[];

  constructor(
    candidates: readonly unknown[],
    hostApiVersion: string = HOST_PLUGIN_API_VERSION,
  ) {
    const rejected: RejectedPluginManifest[] = [];
    candidates.forEach((candidate, sourceIndex) => {
      const parsed = pluginManifestSchema.safeParse(candidate);
      if (!parsed.success) {
        rejected.push({ sourceIndex, code: "INVALID_MANIFEST" });
        return;
      }
      if (this.plugins.has(parsed.data.id)) {
        rejected.push({ sourceIndex, code: "DUPLICATE_PLUGIN_ID" });
        return;
      }
      if (!hasValidActivityContributions(
        parsed.data.id,
        parsed.data.contributions.activities,
      )) {
        rejected.push({ sourceIndex, code: "INVALID_ACTIVITY_CONTRIBUTION" });
        return;
      }
      const compatibility = checkPluginCompatibility(
        parsed.data,
        hostApiVersion,
      );
      this.plugins.set(parsed.data.id, {
        manifest: parsed.data,
        compatibility: compatibility.compatible
          ? { status: "compatible", hostApiVersion, reason: null }
          : {
              status: "incompatible",
              hostApiVersion,
              reason: compatibility.reason,
            },
      });
    });
    this.rejected = rejected;
  }

  list(): readonly RegisteredPlugin[] {
    return [...this.plugins.values()].sort((left, right) =>
      left.manifest.name.localeCompare(right.manifest.name, "zh-CN"),
    );
  }

  get(pluginId: string): RegisteredPlugin | null {
    return this.plugins.get(pluginId) ?? null;
  }
}

let firstPartyRegistry: PluginRegistry | null = null;

export function getFirstPartyPluginRegistry(): PluginRegistry {
  firstPartyRegistry ??= new PluginRegistry(FIRST_PARTY_PLUGIN_MANIFESTS);
  return firstPartyRegistry;
}
