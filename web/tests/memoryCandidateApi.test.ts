import { describe, expect, it, vi } from "vitest";
import { createMemoryCandidateApi } from "@/lib/api/memoryCandidateApi";
import type { MemoryCandidateRepositoryPort } from "@/lib/repositories/memoryCandidateRepository";

const candidateId = "00000000-0000-4000-8000-000000000011";
const conversationId = "00000000-0000-4000-8000-000000000012";
const messageId = "00000000-0000-4000-8000-000000000013";

function repository(
  overrides: Partial<MemoryCandidateRepositoryPort> = {},
): MemoryCandidateRepositoryPort {
  return {
    list: vi.fn().mockResolvedValue([]),
    getSourceMessage: vi.fn().mockResolvedValue({
      conversationId,
      messageId,
      content: "我喜欢通过例题学习数学",
      mode: "auto",
    }),
    createCandidate: vi.fn().mockResolvedValue({
      candidate: { id: candidateId, status: "pending" },
      created: true,
    }),
    confirm: vi.fn(),
    reject: vi.fn(),
    ...overrides,
  } as MemoryCandidateRepositoryPort;
}

function request(body: unknown): Request {
  return new Request("http://localhost/api/v1/memory-candidates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Memory candidate API", () => {
  it("lists by validated status and proposes from server-owned message content", async () => {
    const list = vi.fn().mockResolvedValue([]);
    const createCandidate = vi.fn().mockResolvedValue({
      candidate: { id: candidateId },
      created: true,
    });
    const api = createMemoryCandidateApi(repository({ list, createCandidate }));
    expect((await api.list("pending")).status).toBe(200);
    expect(list).toHaveBeenCalledWith("pending");
    expect((await api.list("unknown")).status).toBe(400);

    const response = await api.extract(request({ conversationId, messageId }));
    expect(response.status).toBe(201);
    expect(createCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ messageId, content: "我喜欢通过例题学习数学" }),
      expect.objectContaining({ kind: "preference" }),
      expect.any(Date),
    );
  });

  it("confirms edited content or rejects with optimistic versioning", async () => {
    const confirm = vi.fn().mockResolvedValue({ id: candidateId, status: "confirmed" });
    const reject = vi.fn().mockResolvedValue({ id: candidateId, status: "rejected" });
    const now = new Date("2026-09-27T10:00:00.000Z");
    const api = createMemoryCandidateApi(repository({ confirm, reject }), () => now);
    expect(
      (
        await api.resolve(
          candidateId,
          request({ action: "confirm", content: "修改后的记忆", expectedVersion: 1 }),
        )
      ).status,
    ).toBe(200);
    expect(confirm).toHaveBeenCalledWith(candidateId, "修改后的记忆", 1, now);
    await api.resolve(candidateId, request({ action: "reject", expectedVersion: 2 }));
    expect(reject).toHaveBeenCalledWith(candidateId, 2, now);
  });

  it("rejects invalid ids, unknown fields and client-supplied source content", async () => {
    const api = createMemoryCandidateApi(repository());
    expect(
      (await api.resolve("bad-id", request({ action: "reject", expectedVersion: 1 }))).status,
    ).toBe(400);
    expect(
      (
        await api.extract(
          request({ conversationId, messageId, content: "伪造的客户端内容" }),
        )
      ).status,
    ).toBe(400);
  });
});
