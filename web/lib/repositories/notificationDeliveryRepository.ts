import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  inboxItems,
  notificationDeliveries,
  notificationPreferences,
  pushSubscriptions,
  taskRuns,
  users,
  type InboxItemRecord,
  type NotificationDeliveryRecord,
  type NotificationPreferenceRecord,
  type PushSubscriptionRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { nextAllowedPushAt, retryAvailableAt } from "@/lib/notifications/quietHours";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type ClaimNotificationDeliveriesInput = {
  workerId: string;
  now: Date;
  leaseDurationMs: number;
  limit: number;
};

export type ClaimedNotificationDelivery = {
  delivery: NotificationDeliveryRecord;
  inboxItem: InboxItemRecord;
  subscription: PushSubscriptionRecord;
  preferences: NotificationPreferenceRecord;
};

export type FinishNotificationDeliveryInput = {
  deliveryId: string;
  workerId: string;
  expectedAttempt: number;
  now: Date;
  outcome:
    | { status: "sent" }
    | { status: "expired" }
    | { status: "failed"; errorCode: string; retryable: boolean };
};

export class NotificationDeliveryRepositoryError extends Error {
  constructor(
    readonly code: "INVALID_CLAIM_OPTIONS" | "DELIVERY_LEASE_LOST",
    message: string,
  ) {
    super(message);
    this.name = "NotificationDeliveryRepositoryError";
  }
}

export interface NotificationDeliveryRepositoryPort {
  planInboxDeliveries(
    now: Date,
    limit?: number,
  ): Promise<{ inboxItems: number; deliveries: number }>;
  claimAvailableDeliveries(
    input: ClaimNotificationDeliveriesInput,
  ): Promise<ClaimedNotificationDelivery[]>;
  deferForQuietHours(
    deliveryId: string,
    workerId: string,
    expectedAttempt: number,
    availableAt: Date,
    now: Date,
  ): Promise<NotificationDeliveryRecord>;
  finishDelivery(
    input: FinishNotificationDeliveryInput,
  ): Promise<NotificationDeliveryRecord>;
}

function validateClaimInput(input: ClaimNotificationDeliveriesInput): void {
  if (!input.workerId.trim() || input.workerId.length > 200) {
    throw new NotificationDeliveryRepositoryError(
      "INVALID_CLAIM_OPTIONS",
      "Worker id must contain 1 to 200 characters.",
    );
  }
  if (
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    input.limit > 100 ||
    !Number.isInteger(input.leaseDurationMs) ||
    input.leaseDurationMs < 5_000 ||
    input.leaseDurationMs > 15 * 60_000
  ) {
    throw new NotificationDeliveryRepositoryError(
      "INVALID_CLAIM_OPTIONS",
      "Claim limit or lease duration is outside the supported range.",
    );
  }
}

export class NotificationDeliveryRepository<
  TQueryResult extends PgQueryResultHKT,
> implements NotificationDeliveryRepositoryPort {
  constructor(private readonly database: PgDatabase<TQueryResult, typeof schema>) {}

  async planInboxDeliveries(
    now: Date,
    limit = 100,
  ): Promise<{ inboxItems: number; deliveries: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
      throw new Error("Inbox planning limit is outside the supported range.");
    }
    return this.database.transaction(async (transaction) => {
      await transaction
        .insert(users)
        .values({ id: LOCAL_USER_ID, displayName: "Local User" })
        .onConflictDoNothing({ target: users.id });
      await transaction
        .insert(notificationPreferences)
        .values({ userId: LOCAL_USER_ID })
        .onConflictDoNothing({ target: notificationPreferences.userId });

      const candidates = await transaction
        .select()
        .from(inboxItems)
        .where(
          and(
            eq(inboxItems.userId, LOCAL_USER_ID),
            isNull(inboxItems.pushPlannedAt),
          ),
        )
        .orderBy(asc(inboxItems.occurredAt), asc(inboxItems.id))
        .limit(limit)
        .for("update", { skipLocked: true });
      if (candidates.length === 0) return { inboxItems: 0, deliveries: 0 };

      const [preferences] = await transaction
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, LOCAL_USER_ID))
        .limit(1);
      const subscriptions = preferences.pushEnabled
        ? await transaction
            .select()
            .from(pushSubscriptions)
            .where(
              and(
                eq(pushSubscriptions.userId, LOCAL_USER_ID),
                eq(pushSubscriptions.status, "active"),
                or(
                  isNull(pushSubscriptions.expiresAt),
                  gt(pushSubscriptions.expiresAt, now),
                ),
              ),
            )
        : [];
      const availableAt = nextAllowedPushAt(now, preferences);
      let deliveries = 0;
      for (const inboxItem of candidates) {
        for (const subscription of subscriptions) {
          // A newly subscribed device must not receive every historical Inbox item.
          if (subscription.createdAt.getTime() > inboxItem.createdAt.getTime()) {
            continue;
          }
          const inserted = await transaction
            .insert(notificationDeliveries)
            .values({
              userId: LOCAL_USER_ID,
              inboxItemId: inboxItem.id,
              subscriptionId: subscription.id,
              availableAt,
            })
            .onConflictDoNothing({
              target: [
                notificationDeliveries.inboxItemId,
                notificationDeliveries.subscriptionId,
              ],
            })
            .returning({ id: notificationDeliveries.id });
          deliveries += inserted.length;
        }
      }
      await transaction
        .update(inboxItems)
        .set({ pushPlannedAt: now, updatedAt: now })
        .where(inArray(inboxItems.id, candidates.map((item) => item.id)));
      return { inboxItems: candidates.length, deliveries };
    });
  }

  async claimAvailableDeliveries(
    input: ClaimNotificationDeliveriesInput,
  ): Promise<ClaimedNotificationDelivery[]> {
    validateClaimInput(input);
    return this.database.transaction(async (transaction) => {
      const [preferences] = await transaction
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, LOCAL_USER_ID))
        .limit(1);
      if (!preferences?.pushEnabled) return [];

      const expiredSubscriptions = await transaction
        .update(pushSubscriptions)
        .set({ status: "expired", updatedAt: input.now })
        .where(
          and(
            eq(pushSubscriptions.userId, LOCAL_USER_ID),
            eq(pushSubscriptions.status, "active"),
            isNotNull(pushSubscriptions.expiresAt),
            lte(pushSubscriptions.expiresAt, input.now),
          ),
        )
        .returning({ id: pushSubscriptions.id });
      if (expiredSubscriptions.length > 0) {
        await transaction
          .update(notificationDeliveries)
          .set({
            status: "cancelled",
            leaseExpiresAt: null,
            errorCode: "PUSH_SUBSCRIPTION_EXPIRED",
            updatedAt: input.now,
          })
          .where(
            and(
              inArray(
                notificationDeliveries.subscriptionId,
                expiredSubscriptions.map((item) => item.id),
              ),
              inArray(notificationDeliveries.status, ["pending", "sending"]),
            ),
          );
      }

      const candidates = await transaction
        .select({
          delivery: notificationDeliveries,
          inboxItem: inboxItems,
          subscription: pushSubscriptions,
        })
        .from(notificationDeliveries)
        .innerJoin(inboxItems, eq(notificationDeliveries.inboxItemId, inboxItems.id))
        .innerJoin(
          pushSubscriptions,
          eq(notificationDeliveries.subscriptionId, pushSubscriptions.id),
        )
        .where(
          and(
            eq(notificationDeliveries.userId, LOCAL_USER_ID),
            eq(pushSubscriptions.status, "active"),
            or(
              and(
                eq(notificationDeliveries.status, "pending"),
                lte(notificationDeliveries.availableAt, input.now),
              ),
              and(
                eq(notificationDeliveries.status, "sending"),
                isNotNull(notificationDeliveries.leaseExpiresAt),
                lte(notificationDeliveries.leaseExpiresAt, input.now),
              ),
            ),
          ),
        )
        .orderBy(
          asc(notificationDeliveries.availableAt),
          asc(notificationDeliveries.id),
        )
        .limit(input.limit)
        .for("update", { skipLocked: true });

      const claimed: ClaimedNotificationDelivery[] = [];
      for (const candidate of candidates) {
        const currentStatus = candidate.delivery.status;
        const guard =
          currentStatus === "pending"
            ? and(
                eq(notificationDeliveries.id, candidate.delivery.id),
                eq(notificationDeliveries.status, "pending"),
                lte(notificationDeliveries.availableAt, input.now),
              )
            : and(
                eq(notificationDeliveries.id, candidate.delivery.id),
                eq(notificationDeliveries.status, "sending"),
                lte(notificationDeliveries.leaseExpiresAt, input.now),
              );
        const [delivery] = await transaction
          .update(notificationDeliveries)
          .set({
            status: "sending",
            attempt: sql`${notificationDeliveries.attempt} + 1`,
            claimedBy: input.workerId,
            leaseExpiresAt: new Date(input.now.getTime() + input.leaseDurationMs),
            lastAttemptAt: input.now,
            errorCode: null,
            updatedAt: input.now,
          })
          .where(guard)
          .returning();
        if (delivery) {
          claimed.push({ ...candidate, delivery, preferences });
        }
      }
      return claimed;
    });
  }

  async deferForQuietHours(
    deliveryId: string,
    workerId: string,
    expectedAttempt: number,
    availableAt: Date,
    now: Date,
  ): Promise<NotificationDeliveryRecord> {
    const [delivery] = await this.database
      .update(notificationDeliveries)
      .set({
        status: "pending",
        attempt: sql`${notificationDeliveries.attempt} - 1`,
        claimedBy: null,
        leaseExpiresAt: null,
        lastAttemptAt: null,
        availableAt,
        errorCode: null,
        updatedAt: now,
      })
      .where(this.ownedDelivery(deliveryId, workerId, expectedAttempt, now))
      .returning();
    return this.requireOwned(delivery);
  }

  async finishDelivery(
    input: FinishNotificationDeliveryInput,
  ): Promise<NotificationDeliveryRecord> {
    return this.database.transaction(async (transaction) => {
      const [owned] = await transaction
        .select()
        .from(notificationDeliveries)
        .where(
          this.ownedDelivery(
            input.deliveryId,
            input.workerId,
            input.expectedAttempt,
            input.now,
          ),
        )
        .for("update")
        .limit(1);
      if (!owned) return this.requireOwned(undefined);

      if (input.outcome.status === "expired") {
        await transaction
          .update(pushSubscriptions)
          .set({
            status: "expired",
            failureCount: sql`${pushSubscriptions.failureCount} + 1`,
            lastFailureAt: input.now,
            updatedAt: input.now,
          })
          .where(eq(pushSubscriptions.id, owned.subscriptionId));
        await transaction
          .update(notificationDeliveries)
          .set({
            status: "cancelled",
            claimedBy: null,
            leaseExpiresAt: null,
            errorCode: "PUSH_SUBSCRIPTION_EXPIRED",
            updatedAt: input.now,
          })
          .where(
            and(
              eq(notificationDeliveries.subscriptionId, owned.subscriptionId),
              inArray(notificationDeliveries.status, ["pending", "sending"]),
            ),
          );
      } else if (input.outcome.status === "sent") {
        await transaction
          .update(pushSubscriptions)
          .set({
            failureCount: 0,
            lastSuccessAt: input.now,
            lastFailureAt: null,
            updatedAt: input.now,
          })
          .where(eq(pushSubscriptions.id, owned.subscriptionId));
      } else {
        await transaction
          .update(pushSubscriptions)
          .set({
            failureCount: sql`${pushSubscriptions.failureCount} + 1`,
            lastFailureAt: input.now,
            updatedAt: input.now,
          })
          .where(eq(pushSubscriptions.id, owned.subscriptionId));
      }

      if (input.outcome.status === "expired") {
        const [cancelled] = await transaction
          .select()
          .from(notificationDeliveries)
          .where(eq(notificationDeliveries.id, owned.id))
          .limit(1);
        return cancelled;
      }

      const retry =
        input.outcome.status === "failed" &&
        input.outcome.retryable &&
        owned.attempt < 5;
      const [delivery] = await transaction
        .update(notificationDeliveries)
        .set({
          status: retry
            ? "pending"
            : input.outcome.status === "sent"
              ? "sent"
              : "failed",
          claimedBy: null,
          leaseExpiresAt: null,
          availableAt: retry
            ? retryAvailableAt(input.now, owned.attempt)
            : owned.availableAt,
          sentAt: input.outcome.status === "sent" ? input.now : null,
          errorCode:
            input.outcome.status === "failed" ? input.outcome.errorCode : null,
          updatedAt: input.now,
        })
        .where(
          this.ownedDelivery(
            input.deliveryId,
            input.workerId,
            input.expectedAttempt,
            input.now,
          ),
        )
        .returning();
      const finished = this.requireOwned(delivery);
      if (input.outcome.status === "sent") {
        const [inboxItem] = await transaction
          .select({ taskRunId: inboxItems.taskRunId })
          .from(inboxItems)
          .where(eq(inboxItems.id, owned.inboxItemId))
          .limit(1);
        if (inboxItem?.taskRunId) {
          await transaction
            .update(taskRuns)
            .set({ notifiedAt: input.now, updatedAt: input.now })
            .where(
              and(
                eq(taskRuns.id, inboxItem.taskRunId),
                isNull(taskRuns.notifiedAt),
              ),
            );
        }
      }
      return finished;
    });
  }

  private ownedDelivery(
    deliveryId: string,
    workerId: string,
    expectedAttempt: number,
    now: Date,
  ) {
    return and(
      eq(notificationDeliveries.id, deliveryId),
      eq(notificationDeliveries.status, "sending"),
      eq(notificationDeliveries.claimedBy, workerId),
      eq(notificationDeliveries.attempt, expectedAttempt),
      gt(notificationDeliveries.leaseExpiresAt, now),
    );
  }

  private requireOwned(
    delivery: NotificationDeliveryRecord | undefined,
  ): NotificationDeliveryRecord {
    if (!delivery) {
      throw new NotificationDeliveryRepositoryError(
        "DELIVERY_LEASE_LOST",
        "Notification delivery is no longer owned by this worker attempt.",
      );
    }
    return delivery;
  }
}

export function createNotificationDeliveryRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return new NotificationDeliveryRepository(database);
}
