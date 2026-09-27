import { afterEach, describe, expect, it, vi } from "vitest";
import {
  confirmMemoryCandidate,
  extractMemoryCandidateFromMessage,
  listMemoryCandidates,
  rejectMemoryCandidate,
} from "@/lib/api/memoryCandidateClient";

describe("memory candidate client", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses versioned extraction and resolution endpoints", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await listMemoryCandidates("pending");
    await extractMemoryCandidateFromMessage({
      conversationId: "conversation-1",
      messageId: "message-1",
    });
    await confirmMemoryCandidate("candidate-1", "修改后的内容", 1);
    await rejectMemoryCandidate("candidate-2", 2);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/memory-candidates?filter=pending",
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/memory-candidates/extract",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/v1/memory-candidates/candidate-1",
      expect.objectContaining({
        method: "PATCH",
        body: '{"action":"confirm","content":"修改后的内容","expectedVersion":1}',
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/v1/memory-candidates/candidate-2",
      expect.objectContaining({
        method: "PATCH",
        body: '{"action":"reject","expectedVersion":2}',
      }),
    );
  });
});
