import { describe, expect, it } from "vitest";
import { FIRST_PARTY_PLUGIN_MANIFESTS } from "@/lib/plugins/firstPartyManifests";
import {
  checkPluginCompatibility,
  pluginManifestSchema,
} from "@/lib/plugins/manifest";

describe("plugin manifest", () => {
  it("strictly validates the bundled first-party manifests", () => {
    for (const manifest of FIRST_PARTY_PLUGIN_MANIFESTS) {
      const parsed = pluginManifestSchema.parse(manifest);
      expect(checkPluginCompatibility(parsed)).toEqual({ compatible: true });
    }
  });

  it("rejects unknown fields, duplicate capabilities and malformed versions", () => {
    const base = pluginManifestSchema.parse(FIRST_PARTY_PLUGIN_MANIFESTS[0]);
    expect(pluginManifestSchema.safeParse({ ...base, executable: "shell" }).success)
      .toBe(false);
    expect(pluginManifestSchema.safeParse({
      ...base,
      requestedCapabilities: ["model.generate", "model.generate"],
    }).success).toBe(false);
    expect(pluginManifestSchema.safeParse({
      ...base,
      requestedCapabilities: ["network.unrestricted"],
    }).success).toBe(false);
    expect(pluginManifestSchema.safeParse({ ...base, version: "latest" }).success)
      .toBe(false);
    expect(pluginManifestSchema.safeParse({
      ...base,
      pluginApiVersion: "*",
    }).success).toBe(false);
    expect(pluginManifestSchema.safeParse({
      ...base,
      pluginApiVersion: ">=01.0.0 <2.0.0",
    }).success).toBe(false);
  });

  it("fails closed when the host API is outside the declared range", () => {
    const manifest = pluginManifestSchema.parse(FIRST_PARTY_PLUGIN_MANIFESTS[0]);
    expect(checkPluginCompatibility(manifest, "1.0.0")).toMatchObject({
      compatible: false,
    });
  });
});
