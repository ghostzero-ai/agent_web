const KEYS = {
  apiKey: "agent_api_key",
  baseUrl: "agent_api_base_url",
  model: "agent_api_model",
} as const;

function read(key: string): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(key);
}

export function getApiKey(): string | null {
  return read(KEYS.apiKey);
}

export function getApiBaseUrl(): string | null {
  return read(KEYS.baseUrl);
}

export function getApiModel(): string | null {
  return read(KEYS.model);
}

export function validateConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!getApiKey()) missing.push("API Key");
  if (!getApiBaseUrl()) missing.push("Base URL");
  if (!getApiModel()) missing.push("Model");
  return { valid: missing.length === 0, missing };
}

// --- Chat message type ---

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
};

// --- Session types and persistence ---

export type Session = {
  id: string;
  title: string;
  messages: ChatMessage[];
  updatedAt: number;
};

const SESSIONS_KEY = "agent_chat_sessions";
const LEGACY_MESSAGES_KEY = "agent_chat_messages";

export function getSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as Session[];
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

  // 已有 sessions 则不迁移
  const existing = getSessions();
  if (existing.length > 0) return existing;

  // 无旧数据则返回空
  const raw = localStorage.getItem(LEGACY_MESSAGES_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [];

    const legacySession: Session = {
      id: crypto.randomUUID(),
      title: "历史对话",
      messages: parsed as ChatMessage[],
      updatedAt: Date.now(),
    };

    const sessions = [legacySession];
    saveSessions(sessions);
    localStorage.removeItem(LEGACY_MESSAGES_KEY);
    return sessions;
  } catch {
    return [];
  }
}
