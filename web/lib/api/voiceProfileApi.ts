import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import {
  createVoiceProfileRepository,
  VoiceProfileRepositoryError,
  type VoiceProfileRepositoryPort,
} from "@/lib/repositories/voiceProfileRepository";

type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "VOICE_PROFILE_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class InputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "VoiceProfileApiInputError";
  }
}

const updateSchema = z
  .object({
    provider: z.literal("system"),
    voiceId: z.string().trim().min(1).max(200).nullable(),
    language: z
      .string()
      .trim()
      .min(2)
      .max(35)
      .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u),
    rate: z.number().int().min(50).max(200),
    pitch: z.number().int().min(0).max(200),
    volume: z.number().int().min(0).max(100),
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

async function handle(operation: (requestId: string) => Promise<Response>) {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof InputError) {
      return errorResponse(requestId, 400, error.code, error.message, false, error.details);
    }
    if (error instanceof VoiceProfileRepositoryError) {
      return errorResponse(requestId, 409, error.code, error.message, false);
    }
    console.error(`[api:${requestId}] Voice profile API failed`, {
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

export function createVoiceProfileApi(
  repositoryOrFactory: VoiceProfileRepositoryPort | (() => VoiceProfileRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;
  return {
    get: () =>
      handle(async (requestId) =>
        response(requestId, { data: await repository().get() }),
      ),
    update: (request: Request) =>
      handle(async (requestId) => {
        const input = await parseUpdate(request);
        return response(requestId, {
          data: await repository().update({ ...input, now: now() }),
        });
      }),
  };
}

export function getVoiceProfileApi() {
  return createVoiceProfileApi(() => createVoiceProfileRepository(getDatabase()));
}
