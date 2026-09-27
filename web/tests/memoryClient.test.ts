import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteMemory, listMemories, updateMemory } from "@/lib/api/memoryClient";

describe("memory client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the formal memory management endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listMemories();
    await updateMemory("memory-1", {
      content: "新内容",
      kind: "goal",
      pinned: true,
      validUntil: null,
      expectedVersion: 1,
    });
    await deleteMemory("memory-1", 2);

    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/v1/memories", expect.any(Object));
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/memories/memory-1",
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/memories/memory-1",
      expect.objectContaining({ method: "DELETE", body: '{"expectedVersion":2}' }),
    );
  });
});
