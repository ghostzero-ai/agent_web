import webPush from "web-push";
import { decryptPushSecret } from "@/lib/notifications/pushSecretCipher";
import { nextAllowedPushAt } from "@/lib/notifications/quietHours";
import type { PushConfiguration } from "@/lib/notifications/pushConfigurationService";
import type {
  ClaimedNotificationDelivery,
  NotificationDeliveryRepositoryPort,
} from "@/lib/repositories/notificationDeliveryRepository";
import { waitForNextPoll } from "@/lib/tasks/reminderWorker";

class StoredPushSubscriptionError extends Error {
  constructor() {
    super("Stored Push subscription is invalid.");
    this.name = "StoredPushSubscriptionError";
  }
}

export type NotificationWorkerOptions = {
  workerId: string;
  batchSize: number;
  leaseDurationMs: number;
};

export type NotificationBatchResult = {
  plannedInboxItems: number;
  plannedDeliveries: number;
  claimed: number;
  sent: number;
  deferred: number;
  failed: number;
};

export type WebPushSend = typeof webPush.sendNotification;

export type NotificationWorkerDependencies = {
  deliveries: NotificationDeliveryRepositoryPort;
  getPushConfiguration: () => Promise<PushConfiguration>;
  sendPush?: WebPushSend;
  now?: () => Date;
  onDeliveryError?: (deliveryId: string, errorCode: string) => void;
};

function parseSubscription(encrypted: string) {
  let parsed: unknown;
  try {
    parsed = JSON.parse(decryptPushSecret(encrypted, "subscription"));
  } catch {
    throw new StoredPushSubscriptionError();
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as { endpoint?: unknown }).endpoint !== "string" ||
    typeof (parsed as { keys?: { p256dh?: unknown } }).keys?.p256dh !== "string" ||
    typeof (parsed as { keys?: { auth?: unknown } }).keys?.auth !== "string"
  ) {
    throw new StoredPushSubscriptionError();
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

function failure(error: unknown): {
  status: "expired" | "failed";
  errorCode: string;
  retryable: boolean;
} {
  const status = statusCode(error);
  if (status === 404 || status === 410) {
    return { status: "expired", errorCode: "PUSH_SUBSCRIPTION_EXPIRED", retryable: false };
  }
  if (status === 408 || status === 429 || (status !== null && status >= 500)) {
    return { status: "failed", errorCode: `PUSH_HTTP_${status}`, retryable: true };
  }
  if (status !== null) {
    return { status: "failed", errorCode: `PUSH_HTTP_${status}`, retryable: false };
  }
  if (error instanceof StoredPushSubscriptionError) {
    return { status: "expired", errorCode: "PUSH_SUBSCRIPTION_INVALID", retryable: false };
  }
  return { status: "failed", errorCode: "PUSH_NETWORK_ERROR", retryable: true };
}

async function deliverOne(
  dependencies: NotificationWorkerDependencies,
  options: NotificationWorkerOptions,
  configuration: PushConfiguration,
  claim: ClaimedNotificationDelivery,
): Promise<"sent" | "deferred" | "failed"> {
  const now = dependencies.now?.() ?? new Date();
  const availableAt = nextAllowedPushAt(now, claim.preferences);
  if (availableAt.getTime() > now.getTime()) {
    await dependencies.deliveries.deferForQuietHours(
      claim.delivery.id,
      options.workerId,
      claim.delivery.attempt,
      availableAt,
      now,
    );
    return "deferred";
  }

  const sendPush = dependencies.sendPush ?? webPush.sendNotification;
  try {
    await sendPush(
      parseSubscription(claim.subscription.encryptedSubscription),
      JSON.stringify({
        title: "学习提醒",
        body: "你有一条新的任务提醒，点击查看。",
        inboxItemId: claim.inboxItem.id,
      }),
      {
        TTL: 24 * 60 * 60,
        timeout: 10_000,
        urgency: "normal",
        topic: claim.inboxItem.id.replaceAll("-", "").slice(0, 32),
        vapidDetails: configuration,
      },
    );
  } catch (error) {
    const outcome = failure(error);
    await dependencies.deliveries.finishDelivery({
      deliveryId: claim.delivery.id,
      workerId: options.workerId,
      expectedAttempt: claim.delivery.attempt,
      now: dependencies.now?.() ?? new Date(),
      outcome:
        outcome.status === "expired"
          ? { status: "expired" }
          : {
              status: "failed",
              errorCode: outcome.errorCode,
              retryable: outcome.retryable,
            },
    });
    dependencies.onDeliveryError?.(claim.delivery.id, outcome.errorCode);
    return "failed";
  }
  await dependencies.deliveries.finishDelivery({
    deliveryId: claim.delivery.id,
    workerId: options.workerId,
    expectedAttempt: claim.delivery.attempt,
    now: dependencies.now?.() ?? new Date(),
    outcome: { status: "sent" },
  });
  return "sent";
}

export async function runNotificationBatch(
  dependencies: NotificationWorkerDependencies,
  options: NotificationWorkerOptions,
): Promise<NotificationBatchResult> {
  const now = dependencies.now?.() ?? new Date();
  const planned = await dependencies.deliveries.planInboxDeliveries(now);
  const claims = await dependencies.deliveries.claimAvailableDeliveries({
    workerId: options.workerId,
    now: dependencies.now?.() ?? new Date(),
    leaseDurationMs: options.leaseDurationMs,
    limit: options.batchSize,
  });
  if (claims.length === 0) {
    return {
      plannedInboxItems: planned.inboxItems,
      plannedDeliveries: planned.deliveries,
      claimed: 0,
      sent: 0,
      deferred: 0,
      failed: 0,
    };
  }
  const configuration = await dependencies.getPushConfiguration();
  const outcomes = await Promise.all(
    claims.map((claim) => deliverOne(dependencies, options, configuration, claim)),
  );
  return {
    plannedInboxItems: planned.inboxItems,
    plannedDeliveries: planned.deliveries,
    claimed: claims.length,
    sent: outcomes.filter((outcome) => outcome === "sent").length,
    deferred: outcomes.filter((outcome) => outcome === "deferred").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
  };
}

export async function runNotificationWorker(
  dependencies: NotificationWorkerDependencies,
  options: NotificationWorkerOptions & {
    pollIntervalMs: number;
    signal: AbortSignal;
    onBatch?: (result: NotificationBatchResult) => void;
    onBatchError?: (error: unknown) => void;
  },
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      const result = await runNotificationBatch(dependencies, options);
      options.onBatch?.(result);
    } catch (error) {
      options.onBatchError?.(error);
    }
    await waitForNextPoll(options.pollIntervalMs, options.signal);
  }
}
