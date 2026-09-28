import { describe, expect, it, vi } from "vitest";
import { createProactivityApi } from "@/lib/api/proactivityApi";
import type { ProactivityRepositoryPort } from "@/lib/repositories/proactivityRepository";

function repository(
  overrides: Partial<ProactivityRepositoryPort> = {},
): ProactivityRepositoryPort {
  return {
    getDashboard: vi.fn().mockResolvedValue({ preferences: { version: 1 } }),
    update: vi.fn(),
    evaluate: vi.fn().mockResolvedValue({ status: "skipped", code: "disabled" }),
    ...overrides,
  } as ProactivityRepositoryPort;
}

function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/proactivity", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  enabled: true,
  maxMessagesPerDay: 1,
  minCooldownHours: 72,
  checkinAfterDays: 3,
  allowedReasons: ["goal_followup", "checkin"],
  pausedUntil: "2026-10-05T04:00:00.000Z",
  expectedVersion: 1,
};

describe("Proactivity API", () => {
  it("updates strict preferences and exposes policy evaluation", async () => {
    const update = vi.fn().mockResolvedValue({ preferences: { version: 2 } });
    const evaluate = vi.fn().mockResolvedValue({ status: "created", inboxItemId: "item" });
    const now = new Date("2026-09-28T04:00:00.000Z");
    const api = createProactivityApi(repository({ update, evaluate }), () => now);
    const response = await api.update(patch(valid));
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      ...valid,
      pausedUntil: new Date(valid.pausedUntil),
      now,
    });
    expect((await api.evaluate()).status).toBe(200);
    expect(evaluate).toHaveBeenCalledWith(now);
  });

  it("rejects invalid budgets, reasons, dates and unknown fields", async () => {
    const api = createProactivityApi(repository());
    expect((await api.update(patch({ ...valid, maxMessagesPerDay: 4 }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, allowedReasons: ["emotion_guess"] }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, pausedUntil: "tomorrow" }))).status).toBe(400);
    expect((await api.update(patch({ ...valid, customPrompt: "联系我" }))).status).toBe(400);
  });
});
