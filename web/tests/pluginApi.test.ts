import { describe, expect, it, vi } from "vitest";
import { createPluginApi } from "@/lib/api/pluginApi";
import {
  PluginRepositoryError,
  type PluginRepositoryPort,
} from "@/lib/repositories/pluginRepository";

function repository(
  overrides: Partial<PluginRepositoryPort> = {},
): PluginRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    setEnabled: vi.fn(),
    ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/v1/plugins/test/enable", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Plugin API", () => {
  it("lists plugins and forwards an optimistic enable request", async () => {
    const setEnabled = vi.fn().mockResolvedValue({ manifest: { id: "study.memorization" } });
    const now = new Date("2026-09-28T05:00:00.000Z");
    const api = createPluginApi(repository({ setEnabled }), () => now);
    expect((await api.list()).status).toBe(200);
    const response = await api.enable(
      "study.memorization",
      request({ expectedVersion: 0 }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(setEnabled).toHaveBeenCalledWith({
      pluginId: "study.memorization",
      enabled: true,
      expectedVersion: 0,
      now,
    });
  });

  it("rejects malformed state changes and exposes stable compatibility errors", async () => {
    const api = createPluginApi(repository({
      setEnabled: vi.fn().mockRejectedValue(
        new PluginRepositoryError("PLUGIN_INCOMPATIBLE", "incompatible"),
      ),
    }));
    expect((await api.enable("bad/id", request({ expectedVersion: 0 }))).status)
      .toBe(400);
    expect((await api.enable(
      "study.memorization",
      request({ expectedVersion: -1 }),
    )).status).toBe(400);
    const incompatible = await api.enable(
      "study.memorization",
      request({ expectedVersion: 0 }),
    );
    expect(incompatible.status).toBe(409);
    await expect(incompatible.json()).resolves.toMatchObject({
      error: { code: "PLUGIN_INCOMPATIBLE", retryable: false },
    });
  });
});
