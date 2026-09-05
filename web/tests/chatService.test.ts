import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyRetryReply,
  applySendReply,
  sendChatMessage,
} from "../lib/ai/chatService";
import type { PromptMessage } from "../lib/ai/messages";
import type { Session } from "../lib/config";
import {
  getActiveMessages,
  getAssistantSiblings,
  normalizeSessionTree,
} from "../lib/conversation/tree";
import {
  installBrowserStorage,
  uninstallBrowserStorage,
} from "./helpers/browserStorage";

beforeEach(() => {
  installBrowserStorage();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uninstallBrowserStorage();
});

describe("sendChatMessage", () => {
  it("streams through the server without browser provider credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        [
          'event: meta\ndata: {"model":"server-model"}\n\n',
          'event: delta\ndata: {"text":"回"}\n\n',
          'event: delta\ndata: {"text":"答"}\n\n',
          "event: done\ndata: {}\n\n",
        ].join(""),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onDelta = vi.fn();

    const prompt: PromptMessage[] = [
      {
        kind: "instruction",
        source: "persona",
        role: "system",
        content: "保持专业",
      },
      {
        kind: "context",
        source: "memory",
        role: "system",
        content: "历史参考",
      },
      {
        kind: "conversation",
        source: "conversation",
        role: "user",
        content: "问题",
      },
    ];

    await expect(sendChatMessage(prompt, undefined, onDelta)).resolves.toBe(
      "回答",
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/model/stream");

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      messages: [
        { role: "system", content: "保持专业" },
        { role: "system", content: "历史参考" },
        { role: "user", content: "问题" },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('"kind"');
    expect(JSON.stringify(body)).not.toContain('"source"');
    expect(init.headers).not.toHaveProperty("authorization");
    expect(onDelta.mock.calls).toEqual([
      ["回", "回"],
      ["答", "回答"],
    ]);
  });

  it("maps a non-successful server response to its safe message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { message: "Server model provider is not configured." } },
          { status: 503 },
        ),
      ),
    );

    await expect(sendChatMessage([])).rejects.toThrow(
      "Server model provider is not configured.",
    );
  });

  it("uses a visible fallback when the stream has no content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("event: done\ndata: {}\n\n", {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );

    await expect(sendChatMessage([])).resolves.toBe("（AI 未返回内容）");
  });
});

describe("chat reply actions", () => {
  const session: Session = {
    id: "session-1",
    title: "测试",
    updatedAt: 1,
    messages: [{ id: "user-1", role: "user", content: "问题" }],
  };

  it("appends a versioned assistant reply without mutating the source", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));

    const result = applySendReply(session, "回答");

    expect(result).not.toBe(session);
    expect(session.messages).toHaveLength(1);
    expect(getActiveMessages(result)).toHaveLength(2);
    expect(getActiveMessages(result)[1]).toMatchObject({
      role: "assistant",
      content: "回答",
      parentId: "user-1",
      createdAt: Date.parse("2026-09-05T00:00:00Z"),
    });
  });

  it("adds a retry version without mutating previous versions", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-05T00:00:00Z"));
    const withAssistant = normalizeSessionTree({
      ...session,
      messages: [
        ...session.messages,
        {
          id: "assistant-1",
          role: "assistant",
          content: "旧回答",
        },
      ],
    });

    const result = applyRetryReply(withAssistant, "新回答", "assistant-1");

    expect(getActiveMessages(withAssistant).at(-1)?.content).toBe("旧回答");
    expect(getActiveMessages(result).at(-1)).toMatchObject({
      content: "新回答",
      parentId: "user-1",
    });
    expect(getAssistantSiblings(result, result.activeLeafId!)).toHaveLength(2);
  });

  it("returns the same session when the retry target is not an assistant", () => {
    expect(applyRetryReply(session, "无效回答", "user-1")).toBe(session);
    expect(applyRetryReply(session, "越界", "missing")).toBe(session);
  });
});
