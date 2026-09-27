import { describe, expect, it, vi } from "vitest";
import { createMemoryApi } from "@/lib/api/memoryApi";
import type { MemoryRepositoryPort } from "@/lib/repositories/memoryRepository";

const memoryId = "00000000-0000-4000-8000-000000000021";

function repository(
  overrides: Partial<MemoryRepositoryPort> = {},
): MemoryRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    retrieve: vi.fn().mockResolvedValue([]),
    retrieveForMessage: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockResolvedValue({ id: memoryId, version: 2 }),
    delete: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function request(method: string, body: unknown): Request {
  return new Request("http://localhost/api/v1/memories", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Memory API", () => {
  it("lists and updates user-controlled memory fields", async () => {
    const update = vi.fn().mockResolvedValue({ id: memoryId, version: 2 });
    const now = new Date("2026-09-28T08:00:00.000Z");
    const api = createMemoryApi(repository({ update }), () => now);
    expect((await api.list()).status).toBe(200);

    const response = await api.update(
      memoryId,
      request("PATCH", {
        content: "我偏好先看例题",
        kind: "preference",
        pinned: true,
        validUntil: "2027-01-01T00:00:00.000Z",
        expectedVersion: 1,
      }),
    );
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      id: memoryId,
      content: "我偏好先看例题",
      kind: "preference",
      pinned: true,
      validUntil: new Date("2027-01-01T00:00:00.000Z"),
      expectedVersion: 1,
      now,
    });
  });

  it("deletes with optimistic versioning and rejects unknown input", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const api = createMemoryApi(repository({ delete: remove }));
    expect(
      (await api.delete(memoryId, request("DELETE", { expectedVersion: 2 }))).status,
    ).toBe(200);
    expect(remove).toHaveBeenCalledWith(memoryId, 2);
    expect(
      (
        await api.update(
          memoryId,
          request("PATCH", {
            content: "内容",
            kind: "fact",
            pinned: false,
            validUntil: null,
            expectedVersion: 1,
            userId: "forged",
          }),
        )
      ).status,
    ).toBe(400);
  });
});
