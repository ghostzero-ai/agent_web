import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createReadingProfileRepository,
  ReadingProfileRepositoryError,
  type ReadingProfileRepositoryPort,
} from "@/lib/repositories/readingProfileRepository";

type ReadingProfileApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "READING_PROFILE_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class ReadingProfileApiInputError extends Error {
  constructor(
    readonly code: Extract<
      ReadingProfileApiErrorCode,
      "INVALID_JSON" | "INVALID_REQUEST"
    >,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ReadingProfileApiInputError";
  }
}

const itemListSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(50)
  .transform((items) => [...new Set(items)]);
const updateSchema = z
  .object({
    topics: itemListSchema,
    readBooks: itemListSchema,
    wantToReadBooks: itemListSchema,
    dislikedBooks: itemListSchema,
    difficulty: z.enum(["introductory", "intermediate", "advanced"]),
    weeklyMinutes: z.number().int().min(15).max(10_080),
    goal: z.enum(["beginner", "systematic", "broaden", "literary"]),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

function headers(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: headers(requestId) });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ReadingProfileApiErrorCode,
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

async function parseUpdate(request: Request): Promise<z.infer<typeof updateSchema>> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ReadingProfileApiInputError(
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }
  try {
    return updateSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new ReadingProfileApiInputError(
        "INVALID_REQUEST",
        "Request validation failed.",
        error.issues,
      );
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
    if (error instanceof ReadingProfileApiInputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        false,
        error.details,
      );
    }
    if (error instanceof ReadingProfileRepositoryError) {
      return errorResponse(requestId, 409, error.code, error.message, false);
    }
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Reading profile API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createReadingProfileApi(
  repositoryOrFactory:
    | ReadingProfileRepositoryPort
    | (() => ReadingProfileRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;
  return {
    get(): Promise<Response> {
      return handle(async (requestId) =>
        response(requestId, { data: await repository().get() }),
      );
    },
    update(request: Request): Promise<Response> {
      return handle(async (requestId) => {
        const input = await parseUpdate(request);
        return response(requestId, {
          data: await repository().update({ ...input, now: now() }),
        });
      });
    },
  };
}

export function getReadingProfileApi() {
  return createReadingProfileApi(() => createReadingProfileRepository(getDatabase()));
}
