import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createProactivityRepository,
  ProactivityRepositoryError,
  type ProactivityRepositoryPort,
} from "@/lib/repositories/proactivityRepository";

type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PROACTIVITY_PREFERENCE_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class InputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ProactivityApiInputError";
  }
}

const updateSchema = z
  .object({
    enabled: z.boolean(),
    maxMessagesPerDay: z.number().int().min(1).max(3),
    minCooldownHours: z.number().int().min(6).max(168),
    checkinAfterDays: z.number().int().min(1).max(30),
    allowedReasons: z
      .array(z.enum(["goal_followup", "checkin"]))
      .max(2)
      .transform((items) => [...new Set(items)]),
    pausedUntil: z.iso.datetime({ offset: true }).nullable(),
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
  return response(requestId, {
    error: {
      code,
      message,
      retryable,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  }, status);
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

async function handle(operation: (requestId: string) => Promise<Response>) {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(requestId, 400, error.code, error.message, false, error.details);
    }
    if (error instanceof ProactivityRepositoryError) {
      return errorResponse(requestId, 409, error.code, error.message, false);
    }
    console.error(`[api:${requestId}] Proactivity API failed`, {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createProactivityApi(
  repositoryOrFactory: ProactivityRepositoryPort | (() => ProactivityRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;
  return {
    get: () =>
      handle(async (requestId) =>
        response(requestId, { data: await repository().getDashboard() }),
      ),
    update: (request: Request) =>
      handle(async (requestId) => {
        const input = await parseUpdate(request);
        return response(requestId, {
          data: await repository().update({
            ...input,
            pausedUntil: input.pausedUntil ? new Date(input.pausedUntil) : null,
            now: now(),
          }),
        });
      }),
    evaluate: () =>
      handle(async (requestId) =>
        response(requestId, { data: await repository().evaluate(now()) }),
      ),
  };
}

export function getProactivityApi() {
  return createProactivityApi(() => createProactivityRepository(getDatabase()));
}
