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
