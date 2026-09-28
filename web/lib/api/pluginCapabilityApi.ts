import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { pluginCapabilityIdSchema } from "@/lib/plugins/capabilityCatalog";
import { getFirstPartyPluginRegistry } from "@/lib/plugins/pluginRegistry";
import {
  createPluginCapabilityRepository,
  PluginCapabilityRepositoryError,
  type PluginCapabilityRepositoryPort,
} from "@/lib/repositories/pluginCapabilityRepository";

const pluginIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const grantSchema = z
  .object({ expectedVersion: z.number().int().min(0) })
  .strict();
const auditLimitSchema = z.coerce.number().int().min(1).max(50).default(20);

type ApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_DISABLED"
  | "PLUGIN_INCOMPATIBLE"
  | "PLUGIN_UPDATE_REVIEW_REQUIRED"
  | "CAPABILITY_NOT_DECLARED"
  | "CAPABILITY_GRANT_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class PluginCapabilityApiInputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PluginCapabilityApiInputError";
  }
}

function response(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-request-id": requestId },
  });
}

function errorResponse(
  requestId: string,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  return response(requestId, {
    error: {
      code,
      message,
      retryable: false,
      requestId,
      ...(details === undefined ? {} : { details }),
    },
  }, status);
}

function parsePluginId(pluginId: string): string {
  const parsed = pluginIdSchema.safeParse(pluginId);
  if (!parsed.success) {
    throw new PluginCapabilityApiInputError(
      "INVALID_REQUEST",
      "Plugin id is invalid.",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

function parseCapabilityId(capabilityId: string) {
  const parsed = pluginCapabilityIdSchema.safeParse(capabilityId);
  if (!parsed.success) {
    throw new PluginCapabilityApiInputError(
      "INVALID_REQUEST",
      "Capability id is invalid.",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

async function parseGrant(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new PluginCapabilityApiInputError(
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }
  try {
    return grantSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new PluginCapabilityApiInputError(
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
    if (error instanceof PluginCapabilityApiInputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        error.details,
      );
    }
    if (error instanceof PluginCapabilityRepositoryError) {
      const status =
        error.code === "PLUGIN_NOT_FOUND" ||
        error.code === "CAPABILITY_NOT_DECLARED"
          ? 404
          : 409;
      return errorResponse(
        requestId,
        status,
        error.code as ApiErrorCode,
        error.message,
      );
    }
    console.error(`[api:${requestId}] Plugin capability API failed`, {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
    );
  }
}

export function createPluginCapabilityApi(
  repositoryOrFactory:
    | PluginCapabilityRepositoryPort
    | (() => PluginCapabilityRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;
  const changeGrant = (
    pluginId: string,
    capabilityId: string,
    request: Request,
    granted: boolean,
  ) => handle(async (requestId) => {
    const input = await parseGrant(request);
    return response(requestId, {
      data: await repository().setGrant({
        pluginId: parsePluginId(pluginId),
        capabilityId: parseCapabilityId(capabilityId),
        granted,
        expectedVersion: input.expectedVersion,
        now: now(),
      }),
    });
  });
  return {
    dashboard: (pluginId: string) => handle(async (requestId) =>
      response(requestId, {
        data: await repository().getDashboard(parsePluginId(pluginId), now()),
      })),
    grant: (pluginId: string, capabilityId: string, request: Request) =>
      changeGrant(pluginId, capabilityId, request, true),
    revoke: (pluginId: string, capabilityId: string, request: Request) =>
      changeGrant(pluginId, capabilityId, request, false),
    audit: (pluginId: string, request: Request) => handle(async (requestId) => {
      const rawLimit = new URL(request.url).searchParams.get("limit") ?? undefined;
      const parsedLimit = auditLimitSchema.safeParse(rawLimit);
      if (!parsedLimit.success) {
        throw new PluginCapabilityApiInputError(
          "INVALID_REQUEST",
          "Audit limit must be between 1 and 50.",
          parsedLimit.error.issues,
        );
      }
      return response(requestId, {
        data: await repository().listAudit(
          parsePluginId(pluginId),
          parsedLimit.data,
        ),
      });
    }),
  };
}

export function getPluginCapabilityApi() {
  return createPluginCapabilityApi(() =>
    createPluginCapabilityRepository(
      getDatabase(),
      getFirstPartyPluginRegistry(),
    ),
  );
}
