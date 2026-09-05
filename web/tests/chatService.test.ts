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
  installBrowserStorage({
    agent_api_key: "test-key",
    agent_api_base_url: "https://provider.example/v1/",
    agent_api_model: "test-model",
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  uninstallBrowserStorage();
});

describe("sendChatMessage", () => {
  it("sends only provider-compatible role and content fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "回答" } }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

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

    await expect(sendChatMessage(prompt)).resolves.toBe("回答");

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://provider.example/v1/chat/completions");

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      model: "test-model",
      messages: [
        { role: "system", content: "保持专业" },
        { role: "system", content: "历史参考" },
        { role: "user", content: "问题" },
      ],
    });
    expect(JSON.stringify(body)).not.toContain('"kind"');
    expect(JSON.stringify(body)).not.toContain('"source"');
  });

  it("fails before fetch when required configuration is missing", async () => {
    localStorage.clear();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(sendChatMessage([])).rejects.toThrow(
      "请先配置：API Key、Base URL、Model",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps a non-successful provider response to a stable error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 429 }),
    );

    await expect(sendChatMessage([])).rejects.toThrow("API 返回错误：429");
  });

  it("uses a visible fallback when the provider has no message content", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [] }) }),
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
