import { createHash } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  notificationPreferences,
  pushSubscriptions,
  pushVapidConfigurations,
  users,
  type NotificationPreferenceRecord,
  type PushSubscriptionRecord,
  type PushVapidConfigurationRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type SaveVapidConfigurationInput = {
  publicKey: string;
  encryptedPrivateKey: string;
  subject: string;
  encryptionKeyVersion: number;
};

export type SavePushSubscriptionInput = {
  endpointHash: string;
  encryptedSubscription: string;
  deviceLabel: string;
  expiresAt: Date | null;
};

export type UpdateNotificationPreferencesInput = {
  pushEnabled: boolean;
  quietHoursEnabled: boolean;
  quietStart: string;
  quietEnd: string;
  expectedVersion: number;
  now: Date;
};

export class NotificationRepositoryError extends Error {
  constructor(
    readonly code: "PREFERENCE_VERSION_CONFLICT" | "SUBSCRIPTION_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "NotificationRepositoryError";
  }
}

export function pushEndpointHash(endpoint: string): string {
  return createHash("sha256").update(endpoint).digest("hex");
}

export interface NotificationRepositoryPort {
  getVapidConfiguration(): Promise<PushVapidConfigurationRecord | null>;
  saveVapidConfiguration(
    input: SaveVapidConfigurationInput,
  ): Promise<PushVapidConfigurationRecord>;
  getPreferences(): Promise<NotificationPreferenceRecord>;
  updatePreferences(
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferenceRecord>;
  listSubscriptions(): Promise<PushSubscriptionRecord[]>;
  saveSubscription(input: SavePushSubscriptionInput): Promise<PushSubscriptionRecord>;
  deleteSubscription(id: string): Promise<boolean>;
}

export class NotificationRepository<
  TQueryResult extends PgQueryResultHKT,
> implements NotificationRepositoryPort {
  constructor(private readonly database: PgDatabase<TQueryResult, typeof schema>) {}

  private async ensureLocalUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  async getVapidConfiguration(): Promise<PushVapidConfigurationRecord | null> {
    await this.ensureLocalUser();
    const [configuration] = await this.database
      .select()
      .from(pushVapidConfigurations)
      .where(eq(pushVapidConfigurations.userId, LOCAL_USER_ID))
      .limit(1);
    return configuration ?? null;
  }

  async saveVapidConfiguration(
    input: SaveVapidConfigurationInput,
  ): Promise<PushVapidConfigurationRecord> {
    await this.ensureLocalUser();
    await this.database
      .insert(pushVapidConfigurations)
      .values({ userId: LOCAL_USER_ID, ...input })
      .onConflictDoNothing({ target: pushVapidConfigurations.userId });
    const configuration = await this.getVapidConfiguration();
    if (!configuration) throw new Error("VAPID configuration was not persisted.");
    return configuration;
  }

  async getPreferences(): Promise<NotificationPreferenceRecord> {
    await this.ensureLocalUser();
    await this.database
      .insert(notificationPreferences)
      .values({ userId: LOCAL_USER_ID })
      .onConflictDoNothing({ target: notificationPreferences.userId });
    const [preferences] = await this.database
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, LOCAL_USER_ID))
      .limit(1);
    if (!preferences) throw new Error("Notification preferences were not persisted.");
    return preferences;
  }

  async updatePreferences(
    input: UpdateNotificationPreferencesInput,
  ): Promise<NotificationPreferenceRecord> {
    await this.getPreferences();
    const [preferences] = await this.database
      .update(notificationPreferences)
      .set({
        pushEnabled: input.pushEnabled,
        quietHoursEnabled: input.quietHoursEnabled,
        quietStart: input.quietStart,
        quietEnd: input.quietEnd,
        version: sql`${notificationPreferences.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(notificationPreferences.userId, LOCAL_USER_ID),
          eq(notificationPreferences.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!preferences) {
      throw new NotificationRepositoryError(
        "PREFERENCE_VERSION_CONFLICT",
        "Notification preferences changed in another client.",
      );
    }
    return preferences;
  }

  async listSubscriptions(): Promise<PushSubscriptionRecord[]> {
    await this.ensureLocalUser();
    return this.database
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, LOCAL_USER_ID))
      .orderBy(desc(pushSubscriptions.createdAt));
  }

  async saveSubscription(
    input: SavePushSubscriptionInput,
  ): Promise<PushSubscriptionRecord> {
    await this.ensureLocalUser();
    const [subscription] = await this.database
      .insert(pushSubscriptions)
      .values({ userId: LOCAL_USER_ID, ...input })
      .onConflictDoUpdate({
        target: [pushSubscriptions.userId, pushSubscriptions.endpointHash],
        set: {
          encryptedSubscription: input.encryptedSubscription,
          deviceLabel: input.deviceLabel,
          expiresAt: input.expiresAt,
          status: "active",
          failureCount: 0,
          lastFailureAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return subscription;
  }

  async deleteSubscription(id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.id, id),
          eq(pushSubscriptions.userId, LOCAL_USER_ID),
        ),
      )
      .returning({ id: pushSubscriptions.id });
    return deleted.length > 0;
  }
}

export function createNotificationRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new NotificationRepository(database);
}
