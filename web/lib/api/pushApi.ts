import { z, ZodError, type ZodType } from "zod";
import { getDatabase } from "@/lib/db/client";
import { createPushConfigurationService } from "@/lib/notifications/pushConfigurationService";
import {
  createNotificationRepository,
  NotificationRepositoryError,
  type NotificationRepositoryPort,
} from "@/lib/repositories/notificationRepository";

type PushApiErrorCode =
  | "INVALID_JSON"
  | "INVALID_REQUEST"
  | "PREFERENCE_VERSION_CONFLICT"
  | "SUBSCRIPTION_NOT_FOUND"
  | "PUSH_CONFIGURATION_ERROR"
  | "INTERNAL_ERROR";

class PushApiInputError extends Error {
  constructor(
    readonly code: Extract<PushApiErrorCode, "INVALID_JSON" | "INVALID_REQUEST">,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "PushApiInputError";
  }
}

const subscriptionIdSchema = z.uuid();
const encodedKeySchema = z.string().min(1).max(512).regex(/^[A-Za-z0-9_-]+$/);
const subscriptionSchema = z.object({
  subscription: z.object({
    endpoint: z.url().max(4_096).refine((value) => value.startsWith("https://"), {
      message: "Push endpoint must use HTTPS.",
    }),
    expirationTime: z.number().nonnegative().nullable(),
    keys: z.object({
      p256dh: encodedKeySchema,
      auth: encodedKeySchema,
    }).strict(),
  }).strict(),
  deviceLabel: z.string().trim().min(1).max(100),
}).strict();
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const preferenceSchema = z.object({
  pushEnabled: z.boolean(),
  quietHoursEnabled: z.boolean(),
  quietStart: timeSchema,
  quietEnd: timeSchema,
  expectedVersion: z.number().int().positive(),
}).strict().refine(
  (input) => !input.quietHoursEnabled || input.quietStart !== input.quietEnd,
  { message: "Quiet hours start and end must differ.", path: ["quietEnd"] },
);

function responseHeaders(requestId: string): HeadersInit {
  return { "cache-control": "no-store", "x-request-id": requestId };
}

function jsonResponse(requestId: string, body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: responseHeaders(requestId) });
}

function errorResponse(
  requestId: string,
  status: number,
  code: PushApiErrorCode,
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

async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new PushApiInputError("INVALID_JSON", "Request body must be valid JSON.");
  }
  try {
    return schema.parse(input);
  } catch (error) {
    if (error instanceof ZodError) {
      throw new PushApiInputError(
        "INVALID_REQUEST",
        "Request validation failed.",
        error.issues,
      );
    }
    throw error;
  }
}

function parseSubscriptionId(id: string): string {
  const result = subscriptionIdSchema.safeParse(id);
  if (!result.success) {
    throw new PushApiInputError(
      "INVALID_REQUEST",
      "Push subscription id must be a UUID.",
      result.error.issues,
    );
  }
  return result.data;
}

function publicSubscription(subscription: {
  id: string;
  deviceLabel: string;
  status: "active" | "expired";
  failureCount: number;
  expiresAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: subscription.id,
    deviceLabel: subscription.deviceLabel,
    status: subscription.status,
    failureCount: subscription.failureCount,
    expiresAt: subscription.expiresAt,
    lastSuccessAt: subscription.lastSuccessAt,
    lastFailureAt: subscription.lastFailureAt,
    createdAt: subscription.createdAt,
  };
}

async function handleRequest(
  operation: (requestId: string) => Promise<Response>,
): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    return await operation(requestId);
  } catch (error) {
    if (error instanceof PushApiInputError) {
      return errorResponse(requestId, 400, error.code, error.message, false, error.details);
    }
    if (error instanceof NotificationRepositoryError) {
      const notFound = error.code === "SUBSCRIPTION_NOT_FOUND";
      return errorResponse(
        requestId,
        notFound ? 404 : 409,
        error.code,
        error.message,
        false,
      );
    }
    const safeError =
      error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError" };
    console.error(`[api:${requestId}] Push API failed`, safeError);
    return errorResponse(
      requestId,
      500,
      "INTERNAL_ERROR",
      "The server could not complete the request.",
      true,
    );
  }
}

export function createPushApi(
  repositoryOrFactory: NotificationRepositoryPort | (() => NotificationRepositoryPort),
  now: () => Date = () => new Date(),
) {
  const repository = (): NotificationRepositoryPort =>
    typeof repositoryOrFactory === "function"
      ? repositoryOrFactory()
      : repositoryOrFactory;

  return {
    getConfiguration(): Promise<Response> {
      return handleRequest(async (requestId) =>
        jsonResponse(
          requestId,
          { data: await createPushConfigurationService(repository()).getPublicState() },
        ),
      );
    },

    saveSubscription(request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const input = await parseBody(request, subscriptionSchema);
        const saved = await createPushConfigurationService(repository()).saveSubscription(
          input.subscription,
          input.deviceLabel,
        );
        return jsonResponse(requestId, { data: publicSubscription(saved) }, 201);
      });
    },

    updatePreferences(request: Request): Promise<Response> {
      return handleRequest(async (requestId) => {
        const input = await parseBody(request, preferenceSchema);
        const preferences = await repository().updatePreferences({
          ...input,
          now: now(),
        });
        return jsonResponse(requestId, {
          data: {
            pushEnabled: preferences.pushEnabled,
            quietHoursEnabled: preferences.quietHoursEnabled,
            quietStart: preferences.quietStart,
            quietEnd: preferences.quietEnd,
            timezone: preferences.timezone,
            version: preferences.version,
          },
        });
      });
    },

    deleteSubscription(id: string): Promise<Response> {
      return handleRequest(async (requestId) => {
        const deleted = await repository().deleteSubscription(parseSubscriptionId(id));
        if (!deleted) {
          throw new NotificationRepositoryError(
            "SUBSCRIPTION_NOT_FOUND",
            "Push subscription was not found.",
          );
        }
        return new Response(null, { status: 204, headers: responseHeaders(requestId) });
      });
    },
  };
}

export function getPushApi() {
  return createPushApi(() => createNotificationRepository(getDatabase()));
}
