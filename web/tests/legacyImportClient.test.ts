import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearLegacySessionsAfterImport,
  importLegacySessions,
  prepareLegacyImportSessions,
} from "@/lib/api/legacyImportClient";
import type { Session } from "@/lib/config";
import { installBrowserStorage, uninstallBrowserStorage } from "./helpers/browserStorage";

const session: Session = {
  id: "legacy",
  title: "历史会话",
  updatedAt: 100,
  messages: [
    { role: "user", content: "问题" },
    { role: "assistant", content: "回答" },
  ],
};

afterEach(() => {
  vi.unstubAllGlobals();
  uninstallBrowserStorage();
});

describe("legacy import browser client", () => {
  it("normalizes a linear legacy session into an explicit tree payload", () => {
    const prepared = prepareLegacyImportSessions([session])[0];
    expect(prepared.schemaVersion).toBe(2);
    expect(prepared.messages).toHaveLength(2);
    expect(prepared.messages[0].parentId).toBeNull();
    expect(prepared.messages[1].parentId).toBe(prepared.messages[0].id);
    expect(prepared.activeLeafId).toBe(prepared.messages[1].id);
  });

  it("does not clear the local backup when the server import fails", async () => {
    const storage = installBrowserStorage({
      agent_chat_sessions: JSON.stringify([session]),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          { error: { message: "数据库不可用" } },
          { status: 503 },
        ),
      ),
    );

    await expect(importLegacySessions([session])).rejects.toThrow("数据库不可用");
    expect(storage.getItem("agent_chat_sessions")).not.toBeNull();
  });

  it("clears local sessions only when the caller confirms server success", () => {
    const storage = installBrowserStorage({ agent_chat_sessions: "[]" });
    clearLegacySessionsAfterImport();
    expect(storage.getItem("agent_chat_sessions")).toBeNull();
  });
});
