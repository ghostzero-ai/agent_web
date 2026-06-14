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

// Chat messages persistence

const CHAT_MESSAGES_KEY = "agent_chat_messages";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export function getChatMessages(): ChatMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CHAT_MESSAGES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as ChatMessage[];
  } catch {
    return [];
  }
}

export function saveChatMessages(messages: ChatMessage[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAT_MESSAGES_KEY, JSON.stringify(messages));
}

export function clearChatMessages(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(CHAT_MESSAGES_KEY);
}

export function validateConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!getApiKey()) missing.push("API Key");
  if (!getApiBaseUrl()) missing.push("Base URL");
  if (!getApiModel()) missing.push("Model");
  return { valid: missing.length === 0, missing };
}
