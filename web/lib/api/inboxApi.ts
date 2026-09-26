import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import type { BriefingFeedback } from "@/lib/db/schema";
import {
  createInboxRepository,
  InboxRepositoryError,
  type InboxFilter,
  type InboxRepositoryPort,
} from "@/lib/repositories/inboxRepository";

type InboxApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "INBOX_ITEM_NOT_FOUND"
  | "INBOX_FEEDBACK_UNSUPPORTED"
  | "INTERNAL_ERROR";

class InboxApiInputError extends Error {
  constructor(
    readonly code: Extract<InboxApiErrorCode, "INVALID_JSON" | "INVALID_REQUEST">,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "InboxApiInputError";
  }
}

const itemIdSchema = z.uuid();
const updateSchema = z.union([
  z.object({ status: z.enum(["unread", "read"]) }).strict(),
  z
    .object({
      feedback: z.enum(["helpful", "not_relevant", "duplicate"]).nullable(),
    })
    .strict(),
]);
const filterSchema = z.enum(["all", "unread", "read"]);

type InboxUpdate =
  | { status: "unread" | "read" }
  | { feedback: BriefingFeedback | null };

function responseHeaders(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function jsonResponse(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders(requestId) });
}

function errorResponse(
  requestId: string,
  status: number,
  code: InboxApiErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return jsonResponse(requestId, {
    error: {
      code,
      message,
      retryable,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  }, status);
}

function parseItemId(id: string): string {
  const result = itemIdSchema.safeParse(id);
  if (!result.success) {
    throw new InboxApiInputError(
      "INVALID_REQUEST",
      "Inbox item id must be a UUID.",
      result.error.issues,
    );
  }
  return result.data;
}

async function parseUpdate(request: Request): Promise<InboxUpdate> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new InboxApiInputError("INVALID_JSON", "Request body must be valid JSON.");
  }
  try {
    return updateSchema.parse(input) as InboxUpdate;
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InboxApiInputError(
        "INVALID_REQUEST",
        "Request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

async function handleRequest(
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof InboxApiInputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        false,
        error.details,
      );
    }
    if (error instanceof InboxRepositoryError) {
      if (error.code === "INBOX_ITEM_NOT_FOUND") {
        return errorResponse(requestId, 404, error.code, error.message, false);
      }
      if (error.code === "INBOX_FEEDBACK_UNSUPPORTED") {
        return errorResponse(requestId, 409, error.code, error.message, false);
      }
    }
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Inbox API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createInboxApi(
  repositoryOrFactory: InboxRepositoryPort | (() => InboxRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = (): InboxRepositoryPort =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;

  return {
    list(filterValue: string | null): Promise<Response> {
      return handleRequest(async (requestId) => {
        const parsed = filterSchema.safeParse(filterValue ?? "all");
        if (!parsed.success) {
          throw new InboxApiInputError(
            "INVALID_REQUEST",
            "Inbox filter must be all, unread or read.",
            parsed.error.issues,
          );
        }
        return jsonResponse(requestId, {
          data: await repository().list(parsed.data as InboxFilter),
        });
      });
    },

    update(id: string, request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const itemId = parseItemId(id);
        const update = await parseUpdate(request);
        const data =
          "status" in update
            ? await repository().markStatus(itemId, update.status, now())
            : await repository().markFeedback(itemId, update.feedback, now());
        return jsonResponse(requestId, { data });
      });
    },

    delete(id: string): Promise<Response> {
      return handleRequest(async (requestId) => {
        const deleted = await repository().delete(parseItemId(id));
        if (!deleted) {
          return errorResponse(
            requestId,
            404,
            "INBOX_ITEM_NOT_FOUND",
            "Inbox item was not found.",
            false,
          );
        }
        return new Response(null, { status: 204, headers: responseHeaders(requestId) });
      });
    },
  };
}

export function getInboxApi() {
  return createInboxApi(() => createInboxRepository(getDatabase()));
}
