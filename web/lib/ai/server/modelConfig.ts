export type ModelProviderConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type ModelProviderStatus = {
  configured: boolean;
  baseUrl: string | null;
  model: string | null;
  missing: string[];
};

export class ModelConfigError extends Error {
  readonly code = "MODEL_NOT_CONFIGURED";

  constructor(readonly missing: string[]) {
    super(`Server model configuration is missing: ${missing.join(", ")}.`);
    this.name = "ModelConfigError";
  }
}

function readServerConfig() {
  return {
    apiKey: process.env.AI_API_KEY?.trim() ?? "",
    baseUrl: process.env.AI_BASE_URL?.trim() ?? "",
    model: process.env.AI_MODEL?.trim() ?? "",
  };
}

function normalizeBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("AI_BASE_URL must be an absolute URL.");
  }

  const allowInsecure = process.env.AI_ALLOW_INSECURE_HTTP === "true";
  if (url.protocol !== "https:" && !(allowInsecure && url.protocol === "http:")) {
    throw new Error(
      "AI_BASE_URL must use HTTPS unless AI_ALLOW_INSECURE_HTTP=true.",
    );
  }

  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function getModelProviderStatus(): ModelProviderStatus {
  const config = readServerConfig();
  const missing: string[] = [];
  let safeBaseUrl: string | null = null;
  if (!config.apiKey) missing.push("AI_API_KEY");
  if (!config.baseUrl) {
    missing.push("AI_BASE_URL");
  } else {
    try {
      safeBaseUrl = new URL(normalizeBaseUrl(config.baseUrl)).origin;
    } catch {
      missing.push("AI_BASE_URL (invalid)");
    }
  }
  if (!config.model) missing.push("AI_MODEL");

  return {
    configured: missing.length === 0,
    baseUrl: safeBaseUrl,
    model: config.model || null,
    missing,
  };
}

export function getModelProviderConfig(): ModelProviderConfig {
  const config = readServerConfig();
  const status = getModelProviderStatus();
  if (!status.configured) throw new ModelConfigError(status.missing);

  return {
    apiKey: config.apiKey,
    baseUrl: normalizeBaseUrl(config.baseUrl),
    model: config.model,
  };
}
