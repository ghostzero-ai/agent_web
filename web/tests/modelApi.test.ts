import { describe, expect, it } from "vitest";
import { createModelApi } from "@/lib/api/modelApi";
import { ModelConfigError } from "@/lib/ai/server/modelConfig";
import type {
  ModelProvider,
  ModelStreamEvent,
} from "@/lib/ai/server/modelProvider";

const config = {
  apiKey: "server-only-key",
  baseUrl: "https://provider.example/v1",
  model: "test-model",
};

function request(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/v1/model/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

describe("Model API", () => {
  it("returns a server SSE stream without exposing provider credentials", async () => {
    let receivedSignal: AbortSignal | undefined;
    const provider: ModelProvider = {
      async *stream(_request, signal): AsyncIterable<ModelStreamEvent> {
        receivedSignal = signal;
        yield { type: "delta", text: "专业" };
        yield { type: "delta", text: "回答" };
        yield { type: "done" };
      },
    };
    const api = createModelApi({
      getConfig: () => config,
      getStatus: () => ({
        configured: true,
        baseUrl: "https://provider.example",
        model: "test-model",
        missing: [],
      }),
      createProvider: () => provider,
    });

    const response = await api.stream(
      request({ messages: [{ role: "user", content: "问题" }] }),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain('event: delta\ndata: {"text":"专业"}');
    expect(body).toContain('event: delta\ndata: {"text":"回答"}');
    expect(body).toContain("event: done");
    expect(body).not.toContain("server-only-key");
    expect(receivedSignal).toBeInstanceOf(AbortSignal);
  });

  it("returns validation and missing-config errors before opening SSE", async () => {
    const api = createModelApi({
      getConfig: () => {
        throw new ModelConfigError(["AI_API_KEY"]);
      },
      getStatus: () => ({
        configured: false,
        baseUrl: null,
        model: null,
        missing: ["AI_API_KEY"],
      }),
      createProvider: () => {
        throw new Error("must not create provider");
      },
    });

    const invalid = await api.stream(request({ messages: [] }));
    expect(invalid.status).toBe(400);
    expect((await invalid.json()).error.code).toBe("INVALID_REQUEST");

    const missing = await api.stream(
      request({ messages: [{ role: "user", content: "问题" }] }),
    );
    const missingBody = await missing.json();
    expect(missing.status).toBe(503);
    expect(missingBody.error).toMatchObject({
      code: "MODEL_NOT_CONFIGURED",
      retryable: false,
      details: { missing: ["AI_API_KEY"] },
    });
  });

  it("propagates client cancellation to the provider signal", async () => {
    let providerWasAborted = false;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const provider: ModelProvider = {
      async *stream(_request, signal): AsyncIterable<ModelStreamEvent> {
        markStarted();
        await new Promise<void>((resolve) => {
          signal?.addEventListener(
            "abort",
            () => {
              providerWasAborted = true;
              resolve();
            },
            { once: true },
          );
        });
      },
    };
    const api = createModelApi({
      getConfig: () => config,
      getStatus: () => ({
        configured: true,
        baseUrl: "https://provider.example",
        model: "test-model",
        missing: [],
      }),
      createProvider: () => provider,
    });
    const controller = new AbortController();
    const response = await api.stream(
      request(
        { messages: [{ role: "user", content: "停止生成" }] },
        controller.signal,
      ),
    );
    const reader = response.body!.getReader();

    await reader.read();
    await started;
    controller.abort();
    await reader.read();

    expect(providerWasAborted).toBe(true);
  });
});
