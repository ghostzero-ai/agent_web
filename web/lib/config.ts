import type { ChatMessage } from "@/lib/ai/messages";
import {
  CONVERSATION_SCHEMA_VERSION,
  normalizeSessionTree,
} from "@/lib/conversation/tree";

export type { ChatMessage } from "@/lib/ai/messages";

const LEGACY_API_KEYS = {
  apiKey: "agent_api_key",
  baseUrl: "agent_api_base_url",
  model: "agent_api_model",
} as const;

export function clearLegacyBrowserApiConfig(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LEGACY_API_KEYS.apiKey);
  localStorage.removeItem(LEGACY_API_KEYS.baseUrl);
  localStorage.removeItem(LEGACY_API_KEYS.model);
}

// --- Session types and persistence ---

export type Session = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
  schemaVersion?: typeof CONVERSATION_SCHEMA_VERSION;
  activeLeafId?: string | null;
};

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<ChatMessage>;
  return (
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string" &&
    (message.id === undefined || typeof message.id === "string") &&
    (message.parentId === undefined ||
      message.parentId === null ||
      typeof message.parentId === "string") &&
    (message.createdAt === undefined || typeof message.createdAt === "number") &&
    (message.versions === undefined ||
      (Array.isArray(message.versions) &&
        message.versions.every((version) => typeof version === "string"))) &&
    (message.activeVersion === undefined ||
      typeof message.activeVersion === "number")
  );
}

export function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<Session>;
  return (
    typeof session.id === "string" &&
    typeof session.title === "string" &&
    typeof session.updatedAt === "number" &&
    (session.schemaVersion === undefined ||
      session.schemaVersion === CONVERSATION_SCHEMA_VERSION) &&
    (session.activeLeafId === undefined ||
      session.activeLeafId === null ||
      typeof session.activeLeafId === "string") &&
    Array.isArray(session.messages) &&
    session.messages.every(isChatMessage)
  );
}

const SESSIONS_KEY = "agent_chat_sessions";
const LEGACY_MESSAGES_KEY = "agent_chat_messages";

export function getSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSession).map(normalizeSessionTree);
  } catch {
    return [];
  }
}

export function saveSessions(sessions: Session[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

/**
 * 迁移旧数据：仅当 sessions 为空且存在旧 agent_chat_messages 时执行一次。
 * 迁移后删除旧 key，返回包含历史数据的 Session 数组。
 */
export function migrateOnce(): Session[] {
  if (typeof window === "undefined") return [];

  // SESSIONS_KEY 一旦存在（包括合法的空数组），当前数据就是事实来源。
  // 不能用 length 判断，否则用户删除最后一个会话后可能被旧数据重新迁移。
  if (localStorage.getItem(SESSIONS_KEY) !== null) {
    const sessions = getSessions();
    saveSessions(sessions);
    return sessions;
  }

  // 无旧数据则返回空
  const raw = localStorage.getItem(LEGACY_MESSAGES_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const messages = parsed.filter(isChatMessage);
    if (messages.length === 0) return [];

    const legacySession: Session = {
      id: crypto.randomUUID(),
      title: "历史对话",
      messages,
      updatedAt: Date.now(),
    };

    const sessions = [normalizeSessionTree(legacySession)];
    saveSessions(sessions);
    localStorage.removeItem(LEGACY_MESSAGES_KEY);
    return sessions;
  } catch {
    return [];
  }
}
