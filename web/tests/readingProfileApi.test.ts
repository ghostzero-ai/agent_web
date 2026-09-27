import { describe, expect, it, vi } from "vitest";
import { createReadingProfileApi } from "@/lib/api/readingProfileApi";
import type { ReadingProfileRepositoryPort } from "@/lib/repositories/readingProfileRepository";

function repository(
  overrides: Partial<ReadingProfileRepositoryPort> = {},
): ReadingProfileRepositoryPort {
  return {
    get: vi.fn().mockResolvedValue({ version: 1 }),
    update: vi.fn(),
    ...overrides,
  };
}

function patch(body: unknown): Request {
  return new Request("http://localhost/api/v1/reading-profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const valid = {
  topics: ["认知科学", "认知科学"],
  readBooks: [],
  wantToReadBooks: [],
  dislikedBooks: [],
  difficulty: "intermediate",
  weeklyMinutes: 120,
  goal: "systematic",
  expectedVersion: 1,
};

describe("Reading profile API", () => {
  it("returns defaults and persists normalized explicit preferences", async () => {
    const update = vi.fn().mockResolvedValue({ version: 2 });
    const now = new Date("2026-09-27T02:00:00.000Z");
    const api = createReadingProfileApi(repository({ update }), () => now);

    expect((await api.get()).status).toBe(200);
    const response = await api.update(patch(valid));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(update).toHaveBeenCalledWith({
      ...valid,
      topics: ["认知科学"],
      now,
    });
  });

  it("rejects invalid time budgets and unknown fields", async () => {
    const api = createReadingProfileApi(repository());
    const invalidBudget = await api.update(patch({ ...valid, weeklyMinutes: 0 }));
    const unknown = await api.update(patch({ ...valid, hidden: true }));
    expect(invalidBudget.status).toBe(400);
    expect((await invalidBudget.json()).error.code).toBe("INVALID_REQUEST");
    expect(unknown.status).toBe(400);
  });
});
