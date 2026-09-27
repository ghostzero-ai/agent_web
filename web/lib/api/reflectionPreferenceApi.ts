import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createReflectionPreferenceRepository,
  ReflectionPreferenceRepositoryError,
  type ReflectionPreferenceRepositoryPort,
} from "@/lib/repositories/reflectionPreferenceRepository";

type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "REFLECTION_PREFERENCE_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class InputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ReflectionPreferenceApiInputError";
  }
}

const listSchema = z
  .array(z.string().trim().min(1).max(200))
  .max(30)
  .transform((items) => [...new Set(items)]);
const updateSchema = z
  .object({
    enabled: z.boolean(),
    goals: listSchema,
    avoidTopics: listSchema,
    style: z.enum(["gentle", "balanced", "challenging"]),
    maxQuestions: z.number().int().min(1).max(3),
    expectedVersion: z.number().int().positive(),
  })
  .strict();

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  });
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

async function parseUpdate(request: Request): Promise<z.infer<typeof updateSchema>> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new InputError("INVALID_JSON", "Request body must be valid JSON.");
  }
  try {
    return updateSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new InputError(
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
    if (error instanceof InputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        false,
        error.details,
      );
    }
    if (error instanceof ReflectionPreferenceRepositoryError) {
      return errorResponse(requestId, 409, error.code, error.message, false);
    }
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Reflection preference API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createReflectionPreferenceApi(
  repositoryOrFactory:
    | ReflectionPreferenceRepositoryPort
    | (() => ReflectionPreferenceRepositoryPort),
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

export function getReflectionPreferenceApi() {
  return createReflectionPreferenceApi(() =>
    createReflectionPreferenceRepository(getDatabase()),
  );
}
