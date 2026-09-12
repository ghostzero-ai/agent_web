import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  InboxItemRecord,
  NotificationDeliveryRecord,
  NotificationPreferenceRecord,
  PushSubscriptionRecord,
} from "@/lib/db/schema";
import { runNotificationBatch } from "@/lib/notifications/notificationWorker";
import {
  PushProviderRegistry,
  type PushProviderOutcome,
} from "@/lib/notifications/pushProvider";
import type {
  ClaimedNotificationDelivery,
  NotificationDeliveryRepositoryPort,
} from "@/lib/repositories/notificationDeliveryRepository";

const FIXED_NOW = new Date("2026-09-13T04:00:00.000Z");
const USER_ID = "00000000-0000-4000-8000-000000000001";
const INBOX_ID = "10000000-0000-4000-8000-000000000001";
const DELIVERY_ID = "20000000-0000-4000-8000-000000000001";
const SUBSCRIPTION_ID = "30000000-0000-4000-8000-000000000001";

function claim(
  preferences: Partial<NotificationPreferenceRecord> = {},
): ClaimedNotificationDelivery {
  const delivery: NotificationDeliveryRecord = {
    id: DELIVERY_ID,
    userId: USER_ID,
    inboxItemId: INBOX_ID,
    subscriptionId: SUBSCRIPTION_ID,
    status: "sending",
    availableAt: FIXED_NOW,
    attempt: 1,
    claimedBy: "worker-test",
    leaseExpiresAt: new Date(FIXED_NOW.getTime() + 60_000),
    lastAttemptAt: FIXED_NOW,
    sentAt: null,
    errorCode: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  const inboxItem: InboxItemRecord = {
    id: INBOX_ID,
    userId: USER_ID,
    taskId: null,
    taskRunId: null,
    source: "reminder",
    title: "绝密考试复习",
    body: "不可出现在锁屏上的私人内容",
    occurredAt: FIXED_NOW,
    status: "unread",
    readAt: null,
    pushPlannedAt: FIXED_NOW,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  const subscription: PushSubscriptionRecord = {
    id: SUBSCRIPTION_ID,
    userId: USER_ID,
    provider: "web-push",
    endpointHash: "endpoint-hash",
    encryptedSubscription: "encrypted-provider-subscription",
    deviceLabel: "Test device",
    status: "active",
    failureCount: 0,
    expiresAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
  };
  const preferenceRecord: NotificationPreferenceRecord = {
    userId: USER_ID,
    pushEnabled: true,
    quietHoursEnabled: false,
    quietStart: "22:00",
    quietEnd: "08:00",
    timezone: "Asia/Shanghai",
    version: 1,
    createdAt: FIXED_NOW,
    updatedAt: FIXED_NOW,
    ...preferences,
  };
  return { delivery, inboxItem, subscription, preferences: preferenceRecord };
}

function providerRegistry(outcome: PushProviderOutcome = { status: "sent" }) {
  const send = vi.fn().mockResolvedValue(outcome);
  return {
    send,
    providers: new PushProviderRegistry([{ id: "web-push", send }]),
  };
}

function repositoryFor(
  claimed: ClaimedNotificationDelivery,
): NotificationDeliveryRepositoryPort & {
  finishDelivery: ReturnType<typeof vi.fn>;
  deferForQuietHours: ReturnType<typeof vi.fn>;
} {
  return {
    planInboxDeliveries: vi.fn().mockResolvedValue({ inboxItems: 1, deliveries: 1 }),
    claimAvailableDeliveries: vi.fn().mockResolvedValue([claimed]),
    deferForQuietHours: vi.fn().mockResolvedValue(claimed.delivery),
    finishDelivery: vi.fn().mockResolvedValue(claimed.delivery),
  };
}

describe("notification worker", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends only a generic privacy-safe lock-screen payload", async () => {
    const claimed = claim();
    const deliveries = repositoryFor(claimed);
    const { providers, send } = providerRegistry();
    const result = await runNotificationBatch(
      {
        deliveries,
        providers,
        now: () => FIXED_NOW,
      },
      { workerId: "worker-test", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toMatchObject({ claimed: 1, sent: 1, failed: 0 });
    const notification = send.mock.calls[0][0].notification;
    expect(notification).toMatchObject({ title: "学习提醒", inboxItemId: INBOX_ID });
    expect(JSON.stringify(notification)).not.toContain(claimed.inboxItem.title);
    expect(JSON.stringify(notification)).not.toContain(claimed.inboxItem.body);
    expect(deliveries.finishDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: { status: "sent" } }),
    );
  });

  it("rechecks quiet hours immediately before sending", async () => {
    const claimed = claim({
      quietHoursEnabled: true,
      quietStart: "22:00",
      quietEnd: "08:00",
    });
    const deliveries = repositoryFor(claimed);
    const { providers, send } = providerRegistry();
    const quietNow = new Date("2026-09-12T15:00:00.000Z");
    const result = await runNotificationBatch(
      {
        deliveries,
        providers,
        now: () => quietNow,
      },
      { workerId: "worker-test", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toMatchObject({ deferred: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(deliveries.deferForQuietHours).toHaveBeenCalledWith(
      DELIVERY_ID,
      "worker-test",
      1,
      new Date("2026-09-13T00:00:00.000Z"),
      quietNow,
    );
  });

  it("does not misclassify a delivery-state write failure as a Push failure", async () => {
    const claimed = claim();
    const deliveries = repositoryFor(claimed);
    deliveries.finishDelivery.mockRejectedValue(new Error("database unavailable"));
    const onDeliveryError = vi.fn();
    const { providers } = providerRegistry();
    await expect(
      runNotificationBatch(
        {
          deliveries,
          providers,
          now: () => FIXED_NOW,
          onDeliveryError,
        },
        { workerId: "worker-test", batchSize: 20, leaseDurationMs: 60_000 },
      ),
    ).rejects.toThrow("database unavailable");
    expect(deliveries.finishDelivery).toHaveBeenCalledTimes(1);
    expect(onDeliveryError).not.toHaveBeenCalled();
  });

  it.each([
    [
      { status: "expired", errorCode: "PUSH_SUBSCRIPTION_EXPIRED" } as const,
      { status: "expired" },
    ],
    [
      { status: "failed", errorCode: "PUSH_HTTP_503", retryable: true } as const,
      { status: "failed", errorCode: "PUSH_HTTP_503", retryable: true },
    ],
  ])("persists the provider outcome $status", async (providerOutcome, expectedOutcome) => {
    const claimed = claim();
    const deliveries = repositoryFor(claimed);
    const onDeliveryError = vi.fn();
    const { providers } = providerRegistry(providerOutcome);
    const result = await runNotificationBatch(
      {
        deliveries,
        providers,
        now: () => FIXED_NOW,
        onDeliveryError,
      },
      { workerId: "worker-test", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result.failed).toBe(1);
    expect(deliveries.finishDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: expectedOutcome }),
    );
    expect(onDeliveryError).toHaveBeenCalledWith(
      DELIVERY_ID,
      providerOutcome.errorCode,
    );
  });
});
