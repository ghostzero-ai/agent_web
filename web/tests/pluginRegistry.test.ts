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
    const registry = new PluginRegistry(FIRST_PARTY_PLUGIN_MANIFESTS, "1.0.0");
    expect(registry.list()).toHaveLength(2);
    expect(registry.list().every((plugin) =>
      plugin.compatibility.status === "incompatible",
    )).toBe(true);
  });
});
