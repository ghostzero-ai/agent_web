import { z, ZodError } from "zod";
import {
  getModelProviderConfig,
  getModelProviderStatus,
  ModelConfigError,
  type ModelProviderConfig,
  type ModelProviderStatus,
} from "@/lib/ai/server/modelConfig";
import {
  ModelProviderError,
  OpenAICompatibleProvider,
  type ModelProvider,
} from "@/lib/ai/server/modelProvider";

type ModelApiDependencies = {
  getConfig: () => ModelProviderConfig;
  getStatus: () => ModelProviderStatus;
  createProvider: (config: ModelProviderConfig) => ModelProvider;
};

const modelRequestSchema = z
  .object({
    messages: z
      .array(
        z
          .object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string().min(1).max(1_000_000),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict()
  .refine(
    (input) =>
      input.messages.reduce((total, message) => total + message.content.length, 0) <=
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
    status(): Response {
      const requestId = crypto.randomUUID();
      return Response.json(
        { data: dependencies.getStatus() },
        { headers: headers(requestId, "application/json") },
      );
    },

    async stream(request: Request): Promise<Response> {
      const requestId = crypto.randomUUID();
      let input: z.infer<typeof modelRequestSchema>;
      let config: ModelProviderConfig;

      try {
        input = await parseRequest(request);
        config = dependencies.getConfig();
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
              sse("meta", { requestId, model: config.model }),
            );
            for await (const event of provider.stream(
              { messages: input.messages },
              abortController.signal,
            )) {
              if (event.type === "delta") {
                controller.enqueue(sse("delta", { text: event.text }));
              } else {
                controller.enqueue(sse("done", {}));
              }
            }
          } catch (error) {
            if (!abortController.signal.aborted) {
              const providerError =
                error instanceof ModelProviderError
                  ? error
                  : new ModelProviderError(
                      "PROVIDER_UNAVAILABLE",
                      "Model stream failed.",
                      true,
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
  return createModelApi({
    getConfig: getModelProviderConfig,
    getStatus: getModelProviderStatus,
    createProvider: (config) => new OpenAICompatibleProvider(config),
  });
}
