import type { ChatCompletionMessage } from "@/lib/ai/messages";
import type { ModelProviderConfig } from "./modelConfig";

export type ModelStreamRequest = {
  messages: ChatCompletionMessage[];
};

export type ModelStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done" };

export interface ModelProvider {
  stream(
    request: ModelStreamRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ModelStreamEvent>;
}

export class ModelProviderError extends Error {
  constructor(
    readonly code:
      | "PROVIDER_AUTHENTICATION_FAILED"
      | "PROVIDER_RATE_LIMITED"
      | "PROVIDER_MODEL_NOT_FOUND"
      | "PROVIDER_REQUEST_REJECTED"
      | "PROVIDER_UNAVAILABLE"
      | "PROVIDER_INVALID_RESPONSE",
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}

function mapProviderStatus(status: number): ModelProviderError {
  if (status === 401 || status === 403) {
    return new ModelProviderError(
      "PROVIDER_AUTHENTICATION_FAILED",
      "Model provider authentication failed.",
      false,
    );
  }
  if (status === 429) {
    return new ModelProviderError(
      "PROVIDER_RATE_LIMITED",
      "Model provider rate limit was reached.",
      true,
    );
  }
  if (status === 404) {
    return new ModelProviderError(
      "PROVIDER_MODEL_NOT_FOUND",
      "Configured model was not found.",
      false,
    );
  }
  if (status >= 400 && status < 500) {
    return new ModelProviderError(
      "PROVIDER_REQUEST_REJECTED",
      "Model provider rejected the request.",
      false,
    );
  }
  return new ModelProviderError(
    "PROVIDER_UNAVAILABLE",
    "Model provider is temporarily unavailable.",
    true,
  );
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0];
  if (!first || typeof first !== "object") return "";
  const choice = first as {
    delta?: { content?: unknown };
    message?: { content?: unknown };
  };
  const content = choice.delta?.content ?? choice.message?.content;
  return typeof content === "string" ? content : "";
}

function parseEventData(frame: string): string | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  return data || null;
}

export class OpenAICompatibleProvider implements ModelProvider {
  constructor(private readonly config: ModelProviderConfig) {}

  async *stream(
    request: ModelStreamRequest,
    signal?: AbortSignal,
  ): AsyncIterable<ModelStreamEvent> {
    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: request.messages,
          stream: true,
        }),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ModelProviderError(
        "PROVIDER_UNAVAILABLE",
        "Could not reach the model provider.",
        true,
      );
    }

    if (!response.ok) throw mapProviderStatus(response.status);

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const text = extractText(await response.json());
      if (!text) {
        throw new ModelProviderError(
          "PROVIDER_INVALID_RESPONSE",
          "Model provider returned no message content.",
          false,
        );
      }
      yield { type: "delta", text };
      yield { type: "done" };
      return;
    }

    if (!response.body) {
      throw new ModelProviderError(
        "PROVIDER_INVALID_RESPONSE",
        "Model provider returned an empty response body.",
        false,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawDone = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";
        if (done && buffer.trim()) {
          frames.push(buffer);
          buffer = "";
        }

        for (const frame of frames) {
          const data = parseEventData(frame);
          if (!data) continue;
          if (data === "[DONE]") {
            sawDone = true;
            break;
          }

          let payload: unknown;
          try {
            payload = JSON.parse(data);
          } catch {
            throw new ModelProviderError(
              "PROVIDER_INVALID_RESPONSE",
              "Model provider returned malformed stream data.",
              false,
            );
          }
          const text = extractText(payload);
          if (text) yield { type: "delta", text };
        }

        if (done || sawDone) break;
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: "done" };
  }
}
