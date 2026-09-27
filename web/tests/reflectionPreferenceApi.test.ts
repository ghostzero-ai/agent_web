import { describe, expect, it, vi } from "vitest";
import { createReflectionPreferenceApi } from "@/lib/api/reflectionPreferenceApi";
import type { ReflectionPreferenceRepositoryPort } from "@/lib/repositories/reflectionPreferenceRepository";

function repository(
  overrides: Partial<ReflectionPreferenceRepositoryPort> = {},
): ReflectionPreferenceRepositoryPort {
  return { get: vi.fn().mockResolvedValue({ version: 1 }), update: vi.fn(), ...overrides };
}

function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/reflection-preferences", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  enabled: true,
  goals: ["完成作品集", "完成作品集"],
  avoidTopics: ["家庭隐私"],
  style: "gentle",
  maxQuestions: 2,
  expectedVersion: 1,
};

describe("Reflection preference API", () => {
  it("normalizes explicit preferences and returns no-store", async () => {
    const update = vi.fn().mockResolvedValue({ version: 2 });
    const now = new Date("2026-09-27T03:00:00.000Z");
    const api = createReflectionPreferenceApi(repository({ update }), () => now);
    expect((await api.get()).status).toBe(200);
    const response = await api.update(patch(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(update).toHaveBeenCalledWith({
      ...valid,
      goals: ["完成作品集"],
      now,
    });
  });

  it("rejects out-of-range counts and unknown fields", async () => {
    const api = createReflectionPreferenceApi(repository());
    expect((await api.update(patch({ ...valid, maxQuestions: 4 }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, hidden: true }))).status).toBe(400);
  });
});
