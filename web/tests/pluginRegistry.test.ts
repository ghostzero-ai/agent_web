import { describe, expect, it } from "vitest";
import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";
import { PluginRegistry } from "@/lib/plugins/pluginRegistry";

describe("PluginRegistry", () => {
  it("discovers valid first-party plugins without letting invalid neighbors block them", () => {
    const registry = new PluginRegistry([
      FIRST_PARTY_PLUGIN_MANIFESTS[0],
      { id: "invalid" },
      FIRST_PARTY_PLUGIN_MANIFESTS[1],
      FIRST_PARTY_PLUGIN_MANIFESTS[0],
    ]);
    expect(registry.list().map((plugin) => plugin.manifest.id).sort()).toEqual([
      "study.memorization",
      "study.problem-solving",
    ]);
    expect(registry.rejected).toEqual([
      { sourceIndex: 1, code: "INVALID_MANIFEST" },
      { sourceIndex: 3, code: "DUPLICATE_PLUGIN_ID" },
    ]);
  });

  it("keeps incompatible manifests discoverable but marked unavailable", () => {
    const registry = new PluginRegistry(FIRST_PARTY_PLUGIN_MANIFESTS, "2.0.0");
    expect(registry.list()).toHaveLength(3);
    expect(registry.list().every((plugin) =>
      plugin.compatibility.status === "incompatible",
    )).toBe(true);
  });

  it("rejects an activity contribution that is not owned by the plugin", () => {
    const manifest = {
      ...(FIRST_PARTY_PLUGIN_MANIFESTS[0] as Record<string, unknown>),
      contributions: {
        ...((FIRST_PARTY_PLUGIN_MANIFESTS[0] as {
          contributions: Record<string, unknown>;
        }).contributions),
        activities: ["problem-solving.practice"],
      },
    };
    const registry = new PluginRegistry([manifest]);

    expect(registry.list()).toEqual([]);
    expect(registry.rejected).toEqual([
      { sourceIndex: 0, code: "INVALID_ACTIVITY_CONTRIBUTION" },
    ]);
  });
});
