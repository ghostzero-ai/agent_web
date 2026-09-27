import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createMemoryCandidateService } from "@/lib/memory/memoryCandidateService";
import {
  createMemoryCandidateRepository,
  MemoryCandidateRepositoryError,
  type MemoryCandidateFilter,
  type MemoryCandidateRepositoryPort,
} from "@/lib/repositories/memoryCandidateRepository";

type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "MEMORY_SOURCE_NOT_FOUND"
  | "MEMORY_CANDIDATE_NOT_FOUND"
  | "MEMORY_CANDIDATE_VERSION_CONFLICT"
  | "MEMORY_CANDIDATE_ALREADY_RESOLVED"
  | "MEMORY_DUPLICATE"
  | "INTERNAL_ERROR";

class InputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "MemoryCandidateApiInputError";
  }
}

const idSchema = z.uuid();
const filterSchema = z.enum(["all", "pending", "confirmed", "rejected"]);
const extractSchema = z
  .object({ conversationId: z.uuid(), messageId: z.uuid() })
  .strict();
const resolutionSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("confirm"),
      content: z.string().trim().min(1).max(500),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reject"),
      expectedVersion: z.number().int().positive(),
    })
    .strict(),
]);

function headers(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: headers(requestId) });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ErrorCode,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return response(
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

function parseId(id: string): string {
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) {
    throw new InputError("INVALID_REQUEST", "Memory candidate id must be a UUID.", parsed.error.issues);
  }
  return parsed.data;
}

async function parseBody<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new InputError("INVALID_JSON", "Request body must be valid JSON.");
  }
  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InputError("INVALID_REQUEST", "Request validation failed.", error.issues);
    }
    throw error;
  }
}

async function handle(
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(requestId, 400, error.code, error.message, false, error.details);
    }
    if (error instanceof MemoryCandidateRepositoryError) {
      const status =
        error.code === "MEMORY_SOURCE_NOT_FOUND" ||
        error.code === "MEMORY_CANDIDATE_NOT_FOUND"
          ? 404
          : 409;
      return errorResponse(requestId, status, error.code, error.message, false);
    }
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Memory candidate API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createMemoryCandidateApi(
  repositoryOrFactory:
    | MemoryCandidateRepositoryPort
    | (() => MemoryCandidateRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;
  return {
    list(filterValue: string | null): Promise<Response> {
      return handle(async (requestId) => {
        const parsed = filterSchema.safeParse(filterValue ?? "all");
        if (!parsed.success) {
          throw new InputError(
            "INVALID_REQUEST",
            "Memory candidate filter must be all, pending, confirmed or rejected.",
            parsed.error.issues,
          );
        }
        return response(requestId, {
          data: await repository().list(parsed.data as MemoryCandidateFilter),
        });
      });
    },
    extract(request: Request): Promise<Response> {
      return handle(async (requestId) => {
        const input = await parseBody(request, extractSchema);
        const result = await createMemoryCandidateService(
          repository(),
        ).proposeFromMessage(input.conversationId, input.messageId, now());
        return response(requestId, { data: result }, result.created ? 201 : 200);
      });
    },
    resolve(id: string, request: Request): Promise<Response> {
      return handle(async (requestId) => {
        const candidateId = parseId(id);
        const input = await parseBody(request, resolutionSchema);
        const candidate =
          input.action === "confirm"
            ? await repository().confirm(
                candidateId,
                input.content,
                input.expectedVersion,
                now(),
              )
            : await repository().reject(
                candidateId,
                input.expectedVersion,
                now(),
              );
        return response(requestId, { data: candidate });
      });
    },
  };
}

export function getMemoryCandidateApi() {
  return createMemoryCandidateApi(() =>
    createMemoryCandidateRepository(getDatabase()),
  );
}
