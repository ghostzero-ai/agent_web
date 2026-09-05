import { z, ZodError, type ZodType } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createConversationRepository,
  RepositoryError,
  type ConversationRepositoryPort,
} from "@/lib/repositories/conversationRepository";

type ApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "CONVERSATION_NOT_FOUND"
  | "MESSAGE_NOT_FOUND"
  | "INVALID_MESSAGE_PARENT"
  | "INVALID_ACTIVE_LEAF"
  | "VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class ApiInputError extends Error {
  constructor(
    readonly code: Extract<ApiErrorCode, "INVALID_JSON" | "INVALID_REQUEST">,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiInputError";
  }
}

const conversationIdSchema = z.uuid();
const createConversationSchema = z
  .object({
    title: z.string().trim().min(1).max(200).default("新对话"),
    mode: z
      .enum(["auto", "professional", "companion", "reflection"])
      .default("auto"),
  })
  .strict();

const appendMessageSchema = z
  .object({
    parentMessageId: z.uuid().nullable().default(null),
    role: z.enum(["system", "developer", "user", "assistant", "tool"]),
    content: z.string().min(1).max(1_000_000),
    status: z
      .enum(["pending", "streaming", "complete", "failed"])
      .default("complete"),
    model: z.string().trim().min(1).max(200).nullable().default(null),
    citations: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(500),
            url: z.url(),
          })
          .strict(),
      )
      .max(100)
      .default([]),
  })
  .strict();

const setActiveLeafSchema = z
  .object({
    messageId: z.uuid().nullable(),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

function responseHeaders(requestId: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-request-id": requestId,
  };
}

function jsonResponse(
  requestId: string,
  body: unknown,
  status = 200,
  headers?: HeadersInit,
): Response {
  return Response.json(body, {
    status,
    headers: { ...responseHeaders(requestId), ...headers },
  });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ApiErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return jsonResponse(
    requestId,
    {
      error: {
        code,
        message,
        retryable,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}

async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiInputError("INVALID_JSON", "Request body must be valid JSON.");
  }

  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ApiInputError(
        "INVALID_REQUEST",
        "Request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

function parseConversationId(id: string): string {
  const result = conversationIdSchema.safeParse(id);
  if (!result.success) {
    throw new ApiInputError(
      "INVALID_REQUEST",
      "Conversation id must be a UUID.",
      result.error.issues,
    );
  }
  return result.data;
}

async function handleRequest(
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof ApiInputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        false,
        error.details,
      );
    }

    if (error instanceof RepositoryError) {
      const status =
        error.code === "CONVERSATION_NOT_FOUND" ||
        error.code === "MESSAGE_NOT_FOUND"
          ? 404
          : 409;
      return errorResponse(
        requestId,
        status,
        error.code,
        error.message,
        false,
      );
    }

    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Conversation API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createConversationApi(
  repositoryOrFactory:
    | ConversationRepositoryPort
    | (() => ConversationRepositoryPort),
) {
  const repository = (): ConversationRepositoryPort =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;

  return {
    list(): Promise<Response> {
      return handleRequest(async (requestId) =>
        jsonResponse(requestId, {
          data: await repository().listConversations(),
        }),
      );
    },

    create(request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const input = await parseBody(request, createConversationSchema);
        const conversation = await repository().createConversation(input);
        return jsonResponse(
          requestId,
          { data: conversation },
          201,
          { location: `/api/v1/conversations/${conversation.id}` },
        );
      });
    },

    get(id: string): Promise<Response> {
      return handleRequest(async (requestId) => {
        const conversation = await repository().getConversation(
          parseConversationId(id),
        );
        if (!conversation) {
          return errorResponse(
            requestId,
            404,
            "CONVERSATION_NOT_FOUND",
            "Conversation was not found.",
            false,
          );
        }
        return jsonResponse(requestId, { data: conversation });
      });
    },

    delete(id: string): Promise<Response> {
      return handleRequest(async (requestId) => {
        const deleted = await repository().deleteConversation(
          parseConversationId(id),
        );
        if (!deleted) {
          return errorResponse(
            requestId,
            404,
            "CONVERSATION_NOT_FOUND",
            "Conversation was not found.",
            false,
          );
        }
        return new Response(null, {
          status: 204,
          headers: responseHeaders(requestId),
        });
      });
    },

    appendMessage(id: string, request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const conversationId = parseConversationId(id);
        const input = await parseBody(request, appendMessageSchema);
        const result = await repository().appendMessage(conversationId, input);
        return jsonResponse(requestId, { data: result }, 201, {
          location: `/api/v1/conversations/${conversationId}#message-${result.message.id}`,
        });
      });
    },

    setActiveLeaf(id: string, request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const conversationId = parseConversationId(id);
        const input = await parseBody(request, setActiveLeafSchema);
        const conversation = await repository().setActiveLeaf(
          conversationId,
          input.messageId,
          input.expectedVersion,
        );
        return jsonResponse(requestId, { data: conversation });
      });
    },
  };
}

export function getConversationApi() {
  return createConversationApi(() =>
    createConversationRepository(getDatabase()),
  );
}
