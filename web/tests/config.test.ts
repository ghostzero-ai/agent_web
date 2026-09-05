import { afterEach, describe, expect, it } from "vitest";

import {
  getApiBaseUrl,
  getApiKey,
  getApiModel,
  getSessions,
  isChatMessage,
  isSession,
  migrateOnce,
  saveSessions,
  validateConfig,
} from "../lib/config";
import {
  installBrowserStorage,
  uninstallBrowserStorage,
} from "./helpers/browserStorage";

afterEach(() => {
  uninstallBrowserStorage();
});

describe("session persistence", () => {
  it("persists an empty collection", () => {
    installBrowserStorage();

    saveSessions([]);

    expect(localStorage.getItem("agent_chat_sessions")).toBe("[]");
    expect(getSessions()).toEqual([]);
  });

  it("does not repopulate an explicitly empty store from legacy data", () => {
    installBrowserStorage({
      agent_chat_sessions: "[]",
      agent_chat_messages: JSON.stringify([
        { role: "user", content: "不应复活的旧消息" },
      ]),
    });

    expect(migrateOnce()).toEqual([]);
    expect(localStorage.getItem("agent_chat_messages")).not.toBeNull();
  });

  it("migrates legacy messages only when the session key never existed", () => {
    installBrowserStorage({
      agent_chat_messages: JSON.stringify([
        { role: "user", content: "需要迁移的旧消息" },
      ]),
    });

    const sessions = migrateOnce();

    expect(sessions).toHaveLength(1);
    expect(sessions[0].title).toBe("历史对话");
    expect(sessions[0].messages[0].content).toBe("需要迁移的旧消息");
    expect(localStorage.getItem("agent_chat_messages")).toBeNull();
    expect(getSessions()).toEqual(sessions);
  });

  it("rewrites stored linear sessions as the v2 message tree", () => {
    installBrowserStorage({
      agent_chat_sessions: JSON.stringify([
        {
          id: "legacy-session",
          title: "旧版本会话",
          updatedAt: 1,
          messages: [
            { id: "user", role: "user", content: "问题" },
            {
              id: "answer",
              role: "assistant",
              content: "新版回答",
              versions: ["旧版回答", "新版回答"],
              activeVersion: 1,
            },
          ],
        },
      ]),
    });

    const sessions = migrateOnce();
    const stored = JSON.parse(localStorage.getItem("agent_chat_sessions")!);

    expect(sessions[0].schemaVersion).toBe(2);
    expect(sessions[0].messages).toHaveLength(3);
    expect(stored).toEqual(sessions);
    expect(stored[0].messages.every((message: object) => "parentId" in message)).toBe(
      true,
    );
  });

  it("filters malformed sessions instead of trusting storage casts", () => {
    installBrowserStorage({
      agent_chat_sessions: JSON.stringify([
        {
          id: "valid",
          title: "有效会话",
          messages: [{ role: "user", content: "你好" }],
          updatedAt: 1,
        },
        {
          id: "invalid-role",
          title: "无效会话",
          messages: [{ role: "system", content: "不能持久化" }],
          updatedAt: 2,
        },
        { id: "missing-fields" },
      ]),
    });

    expect(getSessions().map((session) => session.id)).toEqual(["valid"]);
  });

  it("returns an empty collection for corrupted JSON", () => {
    installBrowserStorage({ agent_chat_sessions: "not-json" });

    expect(getSessions()).toEqual([]);
  });
});

describe("runtime type guards", () => {
  it("accepts only persistent user and assistant messages", () => {
    expect(isChatMessage({ role: "user", content: "问题" })).toBe(true);
    expect(isChatMessage({ role: "assistant", content: "回答" })).toBe(true);
    expect(isChatMessage({ role: "system", content: "指令" })).toBe(false);
    expect(isChatMessage({ role: "user", content: 123 })).toBe(false);
  });

  it("requires valid messages inside a session", () => {
    expect(
      isSession({ id: "1", title: "会话", messages: [], updatedAt: 1 }),
    ).toBe(true);
    expect(
      isSession({
        id: "1",
        title: "会话",
        messages: [{ role: "tool", content: "结果" }],
        updatedAt: 1,
      }),
    ).toBe(false);
  });
});

describe("API configuration", () => {
  it("reports every missing field", () => {
    installBrowserStorage();

    expect(validateConfig()).toEqual({
      valid: false,
      missing: ["API Key", "Base URL", "Model"],
    });
  });

  it("reads a complete configuration", () => {
    installBrowserStorage({
      agent_api_key: "key",
      agent_api_base_url: "https://provider.example/v1",
      agent_api_model: "model",
    });

    expect(getApiKey()).toBe("key");
    expect(getApiBaseUrl()).toBe("https://provider.example/v1");
    expect(getApiModel()).toBe("model");
    expect(validateConfig()).toEqual({ valid: true, missing: [] });
  });
});
