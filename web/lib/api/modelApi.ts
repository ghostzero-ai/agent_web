import { z, ZodError } from "zod";
import { createPromptEnvelope } from "@/lib/ai/promptEnvelope";
import {
  ModelConfigError,
  type ModelProviderConfig,
  type ModelProviderStatus,
} from "@/lib/ai/server/modelConfig";
import {
  resolveModelProviderConfig,
  resolveModelProviderStatus,
} from "@/lib/ai/server/modelCredentialService";
import {
  ModelProviderError,
  OpenAICompatibleProvider,
  type ModelProvider,
} from "@/lib/ai/server/modelProvider";
import { getDatabase } from "@/lib/db/client";
import {
  createPromptRunRepository,
  PromptRunRepositoryError,
  type PromptRunRepositoryPort,
} from "@/lib/repositories/promptRunRepository";

type ModelApiDependencies = {
  getConfig: () => ModelProviderConfig | Promise<ModelProviderConfig>;
  getStatus: () => ModelProviderStatus | Promise<ModelProviderStatus>;
  createProvider: (config: ModelProviderConfig) => ModelProvider;
  runs: PromptRunRepositoryPort;
};

const instructionPromptSchema = z
  .object({
    kind: z.literal("instruction"),
    source: z.enum(["policy", "mode", "persona"]),
    role: z.literal("system"),
    content: z.string().min(1).max(1_000_000),
  })
  .strict();
const contextPromptSchema = z
  .object({
    kind: z.literal("context"),
    source: z.literal("memory"),
    role: z.literal("system"),
    content: z.string().min(1).max(1_000_000),
  })
  .strict();
const conversationPromptSchema = z
  .object({
    kind: z.literal("conversation"),
    source: z.literal("conversation"),
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1).max(1_000_000),
  })
  .strict();

const modelRequestSchema = z
  .object({
    trigger: z.enum(["send", "retry"]),
    conversation: z
      .object({
        id: z.uuid(),
        title: z.string().trim().min(1).max(200),
        activeLeafId: z.uuid().nullable(),
      })
      .strict(),
    prompt: z
      .array(
        z.union([
          instructionPromptSchema,
          contextPromptSchema,
          conversationPromptSchema,
        ]),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine(
    (input) =>
      input.prompt.reduce((total, message) => total + message.content.length, 0) <=
      2_000_000,
    { message: "Combined message content is too large." },
  );

const encoder = new TextEncoder();

function headers(requestId: string, contentType: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "content-type": contentType,
    "x-request-id": requestId,
  };
}

function apiError(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return Response.json(
    {
      error: {
        code,
        message,
        retryable,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    {
      status,
      headers: headers(requestId, "application/json"),
    },
  );
}

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

async function parseRequest(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new SyntaxError("Request body must be valid JSON.");
  }
  return modelRequestSchema.parse(input);
}

export function createModelApi(dependencies: ModelApiDependencies) {
  return {
    async status(): Promise<Response> {
      const requestId = crypto.randomUUID();
      try {
        return Response.json(
          { data: await dependencies.getStatus() },
          { headers: headers(requestId, "application/json") },
        );
      } catch (error) {
        console.error(`[model-config:${requestId}] Status check failed`, {
          name: error instanceof Error ? error.name : "UnknownError",
        });
        return apiError(
          requestId,
          500,
          "INTERNAL_ERROR",
          "The server could not read the model configuration.",
          true,
        );
      }
    },

    async stream(request: Request): Promise<Response> {
      const requestId = crypto.randomUUID();
      let input: z.infer<typeof modelRequestSchema>;
      let config: ModelProviderConfig;
      let envelope: Awaited<ReturnType<typeof createPromptEnvelope>>;

      try {
        input = await parseRequest(request);
        config = await dependencies.getConfig();
        envelope = await createPromptEnvelope({
          runId: requestId,
          trigger: input.trigger,
          conversation: input.conversation,
          prompt: input.prompt,
          provider: {
            provider: "openai-compatible",
            baseUrl: config.baseUrl,
            model: config.model,
          },
        });
        await dependencies.runs.start(envelope);
      } catch (error) {
        if (error instanceof SyntaxError) {
          return apiError(
            requestId,
            400,
            "INVALID_JSON",
            error.message,
            false,
          );
        }
        if (error instanceof ZodError) {
          return apiError(
            requestId,
            400,
            "INVALID_REQUEST",
            "Request validation failed.",
            false,
            error.issues,
          );
        }
        if (error instanceof ModelConfigError) {
          return apiError(
            requestId,
            503,
            error.code,
            "Server model provider is not configured.",
            false,
            { missing: error.missing },
          );
        }
        if (error instanceof PromptRunRepositoryError) {
          return apiError(
            requestId,
            error.code === "CONVERSATION_NOT_FOUND" ? 404 : 409,
            error.code,
            error.message,
            false,
          );
        }
        return apiError(
          requestId,
          500,
          "INTERNAL_ERROR",
          "The server could not prepare the model request.",
          true,
        );
      }

      const abortController = new AbortController();
      const abortUpstream = () => abortController.abort(request.signal.reason);
      if (request.signal.aborted) abortUpstream();
      else request.signal.addEventListener("abort", abortUpstream, { once: true });

      const provider = dependencies.createProvider(config);
      const body = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            controller.enqueue(
              sse("meta", {
                requestId,
                provider: "openai-compatible",
                baseUrl: config.baseUrl,
                model: config.model,
                envelope,
              }),
            );
            let sawDone = false;
            for await (const event of provider.stream(
              { messages: envelope.request.messages },
              abortController.signal,
            )) {
              if (event.type === "delta") {
                controller.enqueue(sse("delta", { text: event.text }));
              } else {
                await dependencies.runs.finish(envelope.runId, "completed");
                sawDone = true;
                controller.enqueue(sse("done", {}));
              }
            }
            if (!sawDone) {
              if (abortController.signal.aborted) {
                await dependencies.runs.finish(envelope.runId, "cancelled");
              } else {
                throw new ModelProviderError(
                  "PROVIDER_INVALID_RESPONSE",
                  "Model stream ended without a completion event.",
                  false,
                );
              }
            }
          } catch (error) {
            if (abortController.signal.aborted) {
              await dependencies.runs.finish(envelope.runId, "cancelled");
            } else {
              const providerError =
                error instanceof ModelProviderError
                  ? error
                  : new ModelProviderError(
                      "PROVIDER_UNAVAILABLE",
                      "Model stream failed.",
                      true,
                    );
              await dependencies.runs.finish(
                envelope.runId,
                "failed",
                providerError.code,
              );
              controller.enqueue(
                sse("error", {
                  code: providerError.code,
                  message: providerError.message,
                  retryable: providerError.retryable,
                  requestId,
                }),
              );
            }
          } finally {
            request.signal.removeEventListener("abort", abortUpstream);
            controller.close();
          }
        },
        cancel() {
          abortController.abort("Client cancelled the response stream.");
          void dependencies.runs.finish(envelope.runId, "cancelled");
        },
      });

      return new Response(body, {
        status: 200,
        headers: {
          ...headers(requestId, "text/event-stream; charset=utf-8"),
          connection: "keep-alive",
          "x-accel-buffering": "no",
        },
      });
    },
  };
}

export function getModelApi() {
  const database = getDatabase();
  return createModelApi({
    getConfig: resolveModelProviderConfig,
    getStatus: resolveModelProviderStatus,
    createProvider: (config) => new OpenAICompatibleProvider(config),
    runs: createPromptRunRepository(database),
  });
}
