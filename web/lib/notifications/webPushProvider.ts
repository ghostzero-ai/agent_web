import webPush from "web-push";
import { decryptPushSecret } from "@/lib/notifications/pushSecretCipher";
import type { PushConfiguration } from "@/lib/notifications/pushConfigurationService";
import type {
  PushNotificationProvider,
  PushProviderOutcome,
} from "@/lib/notifications/pushProvider";

class StoredWebPushSubscriptionError extends Error {
  constructor() {
    super("Stored Web Push subscription is invalid.");
    this.name = "StoredWebPushSubscriptionError";
  }
}

export type WebPushSend = typeof webPush.sendNotification;

function parseSubscription(encrypted: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptPushSecret(encrypted, "subscription"));
  } catch {
    throw new StoredWebPushSubscriptionError();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { endpoint?: unknown }).endpoint !== "string" ||
    typeof (parsed as { keys?: { p256dh?: unknown } }).keys?.p256dh !== "string" ||
    typeof (parsed as { keys?: { auth?: unknown } }).keys?.auth !== "string"
  ) {
    throw new StoredWebPushSubscriptionError();
  }
  return parsed as {
    endpoint: string;
    expirationTime: number | null;
    keys: { p256dh: string; auth: string };
  };
}

function statusCode(error: unknown): number | null {
  if (typeof error !== "object" || error === null) return null;
  const value = (error as { statusCode?: unknown }).statusCode;
  return typeof value === "number" ? value : null;
}

function failure(error: unknown): PushProviderOutcome {
  const status = statusCode(error);
  if (status === 404 || status === 410) {
    return { status: "expired", errorCode: "PUSH_SUBSCRIPTION_EXPIRED" };
  }
  if (status === 408 || status === 429 || (status !== null && status >= 500)) {
    return { status: "failed", errorCode: `PUSH_HTTP_${status}`, retryable: true };
  }
  if (status !== null) {
    return { status: "failed", errorCode: `PUSH_HTTP_${status}`, retryable: false };
  }
  if (error instanceof StoredWebPushSubscriptionError) {
    return { status: "expired", errorCode: "PUSH_SUBSCRIPTION_INVALID" };
  }
  return { status: "failed", errorCode: "PUSH_NETWORK_ERROR", retryable: true };
}

export function createWebPushProvider(
  getConfiguration: () => Promise<PushConfiguration>,
  sendPush: WebPushSend = webPush.sendNotification,
): PushNotificationProvider {
  return {
    id: "web-push",
    async send(input) {
      let subscription;
      try {
        subscription = parseSubscription(input.encryptedSubscription);
      } catch (error) {
        return failure(error);
      }
      const configuration = await getConfiguration();
      try {
        await sendPush(
          subscription,
          JSON.stringify(input.notification),
          {
            TTL: 24 * 60 * 60,
            timeout: 10_000,
            urgency: "normal",
            topic: input.notification.inboxItemId.replaceAll("-", "").slice(0, 32),
            vapidDetails: configuration,
          },
        );
        return { status: "sent" };
      } catch (error) {
        return failure(error);
      }
    },
  };
}
