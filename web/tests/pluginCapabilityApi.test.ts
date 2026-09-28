import { describe, expect, it, vi } from "vitest";
import { createPluginCapabilityApi } from "@/lib/api/pluginCapabilityApi";
import {
  PluginCapabilityRepositoryError,
  type PluginCapabilityRepositoryPort,
} from "@/lib/repositories/pluginCapabilityRepository";

function repository(
  overrides: Partial<PluginCapabilityRepositoryPort> = {},
): PluginCapabilityRepositoryPort {
  return {
    getDashboard: vi.fn().mockResolvedValue({ capabilities: [] }),
    setGrant: vi.fn().mockResolvedValue({ capabilities: [] }),
    reserveInvocation: vi.fn(),
    startAudit: vi.fn(),
    finishAudit: vi.fn(),
    recordDeniedAudit: vi.fn(),
    listAudit: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/v1/plugins/test/capabilities/test/grant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Plugin capability API", () => {
  it("lists policy, changes an explicit grant and lists audit metadata", async () => {
    const getDashboard = vi.fn().mockResolvedValue({ pluginId: "study.memorization" });
    const setGrant = vi.fn().mockResolvedValue({ pluginId: "study.memorization" });
    const listAudit = vi.fn().mockResolvedValue([{ operation: "authorization.grant" }]);
    const now = new Date("2026-09-28T11:00:00.000Z");
    const api = createPluginCapabilityApi(
      repository({ getDashboard, setGrant, listAudit }),
      () => now,
    );

    expect((await api.dashboard("study.memorization")).status).toBe(200);
    const granted = await api.grant(
      "study.memorization",
      "storage.read-write",
      request({ expectedVersion: 0 }),
    );
    expect(granted.status).toBe(200);
    expect(setGrant).toHaveBeenCalledWith({
      pluginId: "study.memorization",
      capabilityId: "storage.read-write",
      granted: true,
      expectedVersion: 0,
      now,
    });
    const audit = await api.audit(
      "study.memorization",
      new Request("http://localhost/api/v1/plugins/study.memorization/audit?limit=5"),
    );
    expect(audit.status).toBe(200);
    expect(listAudit).toHaveBeenCalledWith("study.memorization", 5);
  });

  it("rejects unknown capabilities, malformed versions and disabled plugins", async () => {
    const setGrant = vi.fn().mockRejectedValue(
      new PluginCapabilityRepositoryError("PLUGIN_DISABLED", "disabled"),
    );
    const api = createPluginCapabilityApi(repository({ setGrant }));

    expect((await api.grant(
      "study.memorization",
      "network.unrestricted",
      request({ expectedVersion: 0 }),
    )).status).toBe(400);
    expect((await api.grant(
      "study.memorization",
      "storage.read-write",
      request({ expectedVersion: -1 }),
    )).status).toBe(400);
    const disabled = await api.grant(
      "study.memorization",
      "storage.read-write",
      request({ expectedVersion: 0 }),
    );
    expect(disabled.status).toBe(409);
    await expect(disabled.json()).resolves.toMatchObject({
      error: { code: "PLUGIN_DISABLED", retryable: false },
    });
  });
});
