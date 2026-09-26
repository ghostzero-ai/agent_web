import { afterEach, describe, expect, it, vi } from "vitest";
import {
  appendServerMessage,
  listServerSessions,
  renameServerSession,
  updateServerSession,
} from "@/lib/api/conversationClient";
import { verifyResponse } from "@/lib/ai/responseVerifier";

const verification = verifyResponse({
  answer: "已持久化",
  query: "问题",
  retrieval: {
    status: "skipped",
    reason: "not-needed",
    query: "问题",
    citations: [],
  },
  checkedAt: "2026-09-26T00:00:00.000Z",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("conversation browser client", () => {
  it("loads server records into the existing tree view model", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "11111111-1111-4111-8111-111111111111",
              title: "服务端会话",
              mode: "companion",
              activeLeafMessageId: "22222222-2222-4222-8222-222222222222",
              version: 3,
              updatedAt: "2026-09-06T00:00:00.000Z",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: {
            id: "11111111-1111-4111-8111-111111111111",
            title: "服务端会话",
            mode: "companion",
            activeLeafMessageId: "22222222-2222-4222-8222-222222222222",
            version: 3,
            updatedAt: "2026-09-06T00:00:00.000Z",
            messages: [
              {
                id: "22222222-2222-4222-8222-222222222222",
                parentMessageId: null,
                role: "assistant",
                content: "已持久化",
                citations: [
                  {
                    id: "S1",
                    title: "来源",
                    url: "https://example.com/",
                  },
                ],
                verification,
                createdAt: "2026-09-06T00:00:00.000Z",
              },
            ],
          },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const sessions = await listServerSessions();
    expect(sessions[0]).toMatchObject({
      title: "服务端会话",
      activeLeafId: "22222222-2222-4222-8222-222222222222",
      serverVersion: 3,
      schemaVersion: 2,
      mode: "companion",
    });
    expect(sessions[0].messages[0]).toMatchObject({
      parentId: null,
      role: "assistant",
      content: "已持久化",
      citations: [
        { id: "S1", title: "来源", url: "https://example.com/" },
      ],
      verification,
    });
  });

  it("sends explicit message and optimistic conversation update contracts", async () => {
    const fetchMock = vi.fn().mockImplementation(async () =>
      Response.json({
        data: {
          conversation: { version: 2 },
          message: { id: "message-id" },
        },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await appendServerMessage("conversation-id", {
      parentMessageId: null,
      role: "assistant",
      content: "回答",
      citations: [
        { id: "S1", title: "来源", url: "https://example.com/" },
      ],
      verification,
    });
    await renameServerSession("conversation-id", "问题", 2);
    await updateServerSession("conversation-id", {
      mode: "entertainment",
      expectedVersion: 3,
    });

    const messageBody = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const titleBody = JSON.parse(fetchMock.mock.calls[1][1].body as string);
    const modeBody = JSON.parse(fetchMock.mock.calls[2][1].body as string);
    expect(messageBody).toEqual({
      parentMessageId: null,
      role: "assistant",
      content: "回答",
      status: "complete",
      model: null,
      citations: [
        { id: "S1", title: "来源", url: "https://example.com/" },
      ],
      verification,
    });
    expect(titleBody).toEqual({ title: "问题", expectedVersion: 2 });
    expect(modeBody).toEqual({ mode: "entertainment", expectedVersion: 3 });
  });

  it("surfaces the stable server message on errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { code: "VERSION_CONFLICT", message: "请刷新后重试" } },
          { status: 409 },
        ),
      ),
    );
    await expect(renameServerSession("id", "title", 1)).rejects.toThrow(
      "请刷新后重试",
    );
  });
});
