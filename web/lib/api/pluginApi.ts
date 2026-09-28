import { z, ZodError } from "zod";
import { getDatabase } from "@/lib/db/client";
import { getFirstPartyPluginRegistry } from "@/lib/plugins/pluginRegistry";
import {
  createPluginRepository,
  PluginRepositoryError,
  type PluginRepositoryPort,
} from "@/lib/repositories/pluginRepository";

type ErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_INCOMPATIBLE"
  | "PLUGIN_VERSION_CONFLICT"
  | "INTERNAL_ERROR";

class PluginApiInputError extends Error {
  constructor(
    readonly code: "INVALID_JSON" | "INVALID_REQUEST",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PluginApiInputError";
  }
}

const pluginIdSchema = z
  .string()
  .min(3)
  .max(100)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/);
const stateChangeSchema = z
  .object({ expectedVersion: z.number().int().min(0) })
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
  details?: unknown,
): Response {
  return response(
    requestId,
    {
      error: {
        code,
        message,
        retryable: false,
        requestId,
        ...(details === undefined ? {} : { details }),
      },
    },
    status,
  );
}

async function parseStateChange(
  request: Request,
): Promise<z.infer<typeof stateChangeSchema>> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new PluginApiInputError(
      "INVALID_JSON",
      "Request body must be valid JSON.",
    );
  }
  try {
    return stateChangeSchema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new PluginApiInputError(
        "INVALID_REQUEST",
        "Request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

function parsePluginId(pluginId: string): string {
  const parsed = pluginIdSchema.safeParse(pluginId);
  if (!parsed.success) {
    throw new PluginApiInputError(
      "INVALID_REQUEST",
      "Plugin id is invalid.",
      parsed.error.issues,
    );
  }
  return parsed.data;
}

async function handle(operation: (requestId: string) => Promise<Response>) {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof PluginApiInputError) {
      return errorResponse(
        requestId,
        400,
        error.code,
        error.message,
        error.details,
      );
    }
    if (error instanceof PluginRepositoryError) {
      return errorResponse(
        requestId,
        error.code === "PLUGIN_NOT_FOUND" ? 404 : 409,
        error.code,
        error.message,
      );
    }
    console.error(`[api:${requestId}] Plugin API failed`, {
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

export function createPluginApi(
  repositoryOrFactory: PluginRepositoryPort | (() => PluginRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = () =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;
  const changeState = (pluginId: string, request: Request, enabled: boolean) =>
    handle(async (requestId) => {
      const id = parsePluginId(pluginId);
      const input = await parseStateChange(request);
      return response(requestId, {
        data: await repository().setEnabled({
          pluginId: id,
          enabled,
          expectedVersion: input.expectedVersion,
          now: now(),
        }),
      });
    });
  return {
    list: () =>
      handle(async (requestId) =>
        response(requestId, { data: await repository().list() }),
      ),
    enable: (pluginId: string, request: Request) =>
      changeState(pluginId, request, true),
    disable: (pluginId: string, request: Request) =>
      changeState(pluginId, request, false),
  };
}

export function getPluginApi() {
  return createPluginApi(() =>
    createPluginRepository(getDatabase(), getFirstPartyPluginRegistry()),
  );
}
