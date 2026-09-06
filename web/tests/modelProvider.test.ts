import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getModelProviderConfig,
  getModelProviderStatus,
  ModelConfigError,
} from "@/lib/ai/server/modelConfig";
import {
  OpenAICompatibleProvider,
} from "@/lib/ai/server/modelProvider";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("server model configuration", () => {
  it("keeps the key private while reporting safe provider status", () => {
    vi.stubEnv("AI_API_KEY", "super-secret");
    vi.stubEnv("AI_BASE_URL", "https://provider.example/v1/");
    vi.stubEnv("AI_MODEL", "test-model");

    expect(getModelProviderConfig()).toEqual({
      apiKey: "super-secret",
      baseUrl: "https://provider.example/v1",
      model: "test-model",
    });
    expect(getModelProviderStatus()).toEqual({
      configured: true,
      baseUrl: "https://provider.example",
      model: "test-model",
      missing: [],
    });
    expect(JSON.stringify(getModelProviderStatus())).not.toContain("super-secret");
  });

  it("requires complete config and explicit opt-in for HTTP", () => {
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_BASE_URL", "http://127.0.0.1:11434/v1");
    vi.stubEnv("AI_MODEL", "");

    expect(() => getModelProviderConfig()).toThrow(ModelConfigError);
    expect(getModelProviderStatus().missing).toEqual([
      "AI_API_KEY",
      "AI_BASE_URL (invalid)",
      "AI_MODEL",
    ]);

    vi.stubEnv("AI_ALLOW_INSECURE_HTTP", "true");
    expect(getModelProviderStatus().baseUrl).toBe("http://127.0.0.1:11434");
  });

  it("rejects provider URLs with embedded credentials", () => {
    vi.stubEnv("AI_API_KEY", "super-secret");
    vi.stubEnv(
      "AI_BASE_URL",
      "https://user:password@provider.example/v1",
    );
    vi.stubEnv("AI_MODEL", "test-model");

    expect(() => getModelProviderConfig()).toThrow(ModelConfigError);
    expect(getModelProviderStatus()).toMatchObject({
      configured: false,
      baseUrl: null,
      missing: ["AI_BASE_URL (invalid)"],
    });
    expect(JSON.stringify(getModelProviderStatus())).not.toContain("password");
  });
});

describe("OpenAICompatibleProvider", () => {
  it("retries a transient DNS lookup failure before streaming", async () => {
    const dnsError = Object.assign(new TypeError("fetch failed"), {
      cause: { code: "EAI_AGAIN" },
    });
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(dnsError)
      .mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const provider = new OpenAICompatibleProvider({
      apiKey: "server-secret",
      baseUrl: "https://provider.example/v1",
      model: "test-model",
    });

    const events = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", content: "你好" }],
    })) {
      events.push(event);
    }

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toEqual([
      { type: "delta", text: "OK" },
      { type: "done" },
    ]);
    expect(console.warn).toHaveBeenCalledWith(
      "[model-provider] Retrying after transient DNS failure",
      { code: "EAI_AGAIN", attempt: 2 },
    );
  });

  it("parses split OpenAI-compatible SSE chunks", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"你"}}]}\n'),
        );
        controller.enqueue(
          encoder.encode(
            '\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n',
          ),
        );
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenAICompatibleProvider({
      apiKey: "server-secret",
      baseUrl: "https://provider.example/v1",
      model: "test-model",
    });

    const events = [];
    for await (const event of provider.stream({
      messages: [{ role: "user", content: "你好" }],
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "你" },
      { type: "delta", text: "好" },
      { type: "done" },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://provider.example/v1/chat/completions");
    expect(init.headers).toMatchObject({
      authorization: "Bearer server-secret",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "test-model",
      stream: true,
      messages: [{ role: "user", content: "你好" }],
    });
  });

  it("maps provider status without returning its response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("upstream details", { status: 429 }),
      ),
    );
    const provider = new OpenAICompatibleProvider({
      apiKey: "key",
      baseUrl: "https://provider.example/v1",
      model: "model",
    });

    const consume = async () => {
      for await (const event of provider.stream({ messages: [] })) void event;
    };
    await expect(consume()).rejects.toMatchObject({
      code: "PROVIDER_RATE_LIMITED",
      retryable: true,
    });
  });
});
