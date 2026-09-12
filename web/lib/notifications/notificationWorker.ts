import { nextAllowedPushAt } from "@/lib/notifications/quietHours";
import { PushProviderRegistry } from "@/lib/notifications/pushProvider";
import type {
  ClaimedNotificationDelivery,
  NotificationDeliveryRepositoryPort,
} from "@/lib/repositories/notificationDeliveryRepository";
import { waitForNextPoll } from "@/lib/tasks/reminderWorker";

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

export type NotificationWorkerDependencies = {
  deliveries: NotificationDeliveryRepositoryPort;
  providers: PushProviderRegistry;
  now?: () => Date;
  onDeliveryError?: (deliveryId: string, errorCode: string) => void;
};

async function deliverOne(
  dependencies: NotificationWorkerDependencies,
  options: NotificationWorkerOptions,
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

  const outcome = await dependencies.providers.send(
    claim.subscription.provider,
    {
      encryptedSubscription: claim.subscription.encryptedSubscription,
      notification: {
        title: "学习提醒",
        body: "你有一条新的任务提醒，点击查看。",
        inboxItemId: claim.inboxItem.id,
      },
    },
  );
  if (outcome.status !== "sent") {
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
  const outcomes = await Promise.all(
    claims.map((claim) => deliverOne(dependencies, options, claim)),
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
