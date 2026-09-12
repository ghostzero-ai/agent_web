import { z, ZodError } from "zod";
import { CredentialCipherError } from "@/lib/ai/server/credentialCipher";
import { normalizeBaseUrl } from "@/lib/ai/server/modelConfig";
import {
  getModelCredentialService,
  ModelCredentialTestError,
  type ModelCredentialInput,
  type ModelCredentialPublicStatus,
  type ModelCredentialTestResult,
} from "@/lib/ai/server/modelCredentialService";

type ModelCredentialApiDependencies = {
  getStatus: () => Promise<ModelCredentialPublicStatus>;
  save: (input: ModelCredentialInput) => Promise<ModelCredentialPublicStatus>;
  delete: () => Promise<boolean>;
  test: (
    input: ModelCredentialInput,
    signal?: AbortSignal,
  ) => Promise<ModelCredentialTestResult>;
};

const credentialInputSchema = z
  .object({
    apiKey: z.string().trim().min(8).max(10_000),
    provider: z
      .string()
      .trim()
      .min(1)
      .max(100)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/),
    baseUrl: z.string().trim().url().max(2_048),
    model: z.string().trim().min(1).max(200),
  })
  .strict();

class CredentialApiInputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "CredentialApiInputError";
  }
}

function headers(requestId: string): HeadersInit {
  return {
    "cache-control": "no-store",
    "x-request-id": requestId,
  };
}

function json(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: headers(requestId) });
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
  retryable: boolean,
  details?: unknown,
): Response {
  return json(
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

async function parseInput(request: Request): Promise<ModelCredentialInput> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new CredentialApiInputError(
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }

  try {
    const input = credentialInputSchema.parse(body);
    try {
      return { ...input, baseUrl: normalizeBaseUrl(input.baseUrl) };
    } catch {
      throw new CredentialApiInputError(
        "INVALID_REQUEST",
        "Provider Base URL is not allowed.",
      );
    }
  } catch (error) {
    if (error instanceof CredentialApiInputError) throw error;
    if (error instanceof ZodError) {
      throw new CredentialApiInputError(
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
    if (error instanceof CredentialApiInputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        false,
        error.details,
      );
    }
    if (error instanceof ModelCredentialTestError) {
      const status = error.code === "PROVIDER_AUTH_FAILED" ? 422 : 502;
      return errorResponse(
        requestId,
        status,
        error.code,
        error.message,
        error.retryable,
      );
    }
    if (error instanceof CredentialCipherError) {
      return errorResponse(
        requestId,
        503,
        "CREDENTIAL_STORE_UNAVAILABLE",
        "Server credential encryption is not configured.",
        false,
      );
    }

    console.error(`[credential-api:${requestId}] Request failed`, {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the credential request.",
      true,
    );
  }
}

export function createModelCredentialApi(
  dependencies: ModelCredentialApiDependencies,
) {
  return {
    get(): Promise<Response> {
      return handle(async (requestId) =>
        json(requestId, { data: await dependencies.getStatus() }),
      );
    },

    put(request: Request): Promise<Response> {
      return handle(async (requestId) => {
        const status = await dependencies.save(await parseInput(request));
        return json(requestId, { data: status });
      });
    },

    delete(): Promise<Response> {
      return handle(async (requestId) => {
        await dependencies.delete();
        return new Response(null, { status: 204, headers: headers(requestId) });
      });
    },

    test(request: Request): Promise<Response> {
      return handle(async (requestId) => {
        const result = await dependencies.test(
          await parseInput(request),
          request.signal,
        );
        return json(requestId, { data: result });
      });
    },
  };
}

export function getModelCredentialApi() {
  const service = getModelCredentialService();
  return createModelCredentialApi({
    getStatus: () => service.getStatus(),
    save: (input) => service.save(input),
    delete: () => service.delete(),
    test: (input, signal) => service.test(input, signal),
  });
}
