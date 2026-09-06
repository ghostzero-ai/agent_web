import type { Session } from "@/lib/config";
import { normalizeSessionTree } from "@/lib/conversation/tree";

const SESSIONS_KEY = "agent_chat_sessions";

export type LegacyImportPreview = {
  total: number;
  importable: number;
  alreadyImported: number;
  existingSourceIds: string[];
};

export type LegacyImportResult = LegacyImportPreview & {
  imported: number;
  conversationIds: string[];
};

export function prepareLegacyImportSessions(sessions: Session[]) {
  return sessions.map((candidate) => {
    const session = normalizeSessionTree(candidate);
    return {
      id: session.id,
      title: session.title.trim() || "历史对话",
      messages: session.messages.map((message) => ({
        id: message.id!,
        parentId: message.parentId ?? null,
        role: message.role,
        content: message.content,
        createdAt: message.createdAt ?? session.updatedAt,
      })),
      updatedAt: session.updatedAt,
      schemaVersion: session.schemaVersion,
      activeLeafId: session.activeLeafId ?? null,
    };
  });
}

async function executeImport<T>(action: "preview" | "import", sessions: Session[]) {
  const response = await fetch("/api/v1/imports/local-storage", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      action,
      sessions: prepareLegacyImportSessions(sessions),
    }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body?.error?.message;
    throw new Error(
      typeof message === "string" ? message : `导入请求失败：${response.status}`,
    );
  }
  return body.data as T;
}

export function previewLegacySessions(
  sessions: Session[],
): Promise<LegacyImportPreview> {
  return executeImport("preview", sessions);
}

export function importLegacySessions(
  sessions: Session[],
): Promise<LegacyImportResult> {
  return executeImport("import", sessions);
}

export function clearLegacySessionsAfterImport(): void {
  localStorage.removeItem(SESSIONS_KEY);
}
