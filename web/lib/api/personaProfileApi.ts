import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createPersonaProfileRepository,
  PersonaProfileRepositoryError,
  type PersonaProfileRepositoryPort,
} from "@/lib/repositories/personaProfileRepository";

type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PERSONA_PROFILE_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class InputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PersonaProfileApiInputError";
  }
}

const score = z.number().int().min(0).max(100);
const displayName = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N} _·.-]+$/u, "Only name-like characters are allowed.");
const updateSchema = z
  .object({
    name: displayName,
    preferredAddress: displayName.nullable(),
    warmth: score,
    humor: score,
    directness: score,
    verbosity: score,
    initiative: score,
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
    error: { code, message, retryable, requestId, ...(details === undefined ? {} : { details }) },
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
      throw new InputError("INVALID_REQUEST", "Request validation failed.", error.issues);
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
    if (error instanceof PersonaProfileRepositoryError) {
      return errorResponse(requestId, 409, error.code, error.message, false);
    }
    console.error(`[api:${requestId}] Persona profile API failed`, {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(requestId, 500, "INTERNAL_ERROR", "The server could not complete the request.", true);
  }
}

export function createPersonaProfileApi(
  repositoryOrFactory: PersonaProfileRepositoryPort | (() => PersonaProfileRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function" ? repositoryOrFactory() : repositoryOrFactory;
  return {
    get: () => handle(async (requestId) => response(requestId, { data: await repository().get() })),
    update: (request: Request) => handle(async (requestId) => {
      const input = await parseUpdate(request);
      return response(requestId, { data: await repository().update({ ...input, now: now() }) });
    }),
  };
}

export function getPersonaProfileApi() {
  return createPersonaProfileApi(() => createPersonaProfileRepository(getDatabase()));
}
