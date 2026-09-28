import {
  and,
  desc,
  eq,
  gt,
  gte,
  isNull,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  conversations,
  inboxItems,
  memoryItems,
  messages,
  notificationPreferences,
  personaProfiles,
  proactivityLedger,
  proactivityPreferences,
  users,
  type ProactivityLedgerRecord,
  type ProactivityPolicySnapshot,
  type ProactivityPreferenceRecord,
  type ProactivityReason,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import {
  evaluateProactivity,
  shanghaiDayStart,
  type ProactivityDecision,
  type ProactivitySignal,
} from "@/lib/proactivity/proactivityPolicy";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type UpdateProactivityPreferenceInput = {
  enabled: boolean;
  maxMessagesPerDay: number;
  minCooldownHours: number;
  checkinAfterDays: number;
  allowedReasons: ProactivityReason[];
  pausedUntil: Date | null;
  expectedVersion: number;
  now: Date;
};

export type ProactivityContact = ProactivityLedgerRecord & {
  inboxStatus: "unread" | "read" | null;
};

export type ProactivityDashboard = {
  preferences: ProactivityPreferenceRecord;
  quietHours: {
    enabled: boolean;
    start: string;
    end: string;
    timezone: "Asia/Shanghai";
  };
  recentContacts: ProactivityContact[];
};

export type ProactivityRunResult =
  | (Extract<ProactivityDecision, { status: "created" }> & {
      inboxItemId: string;
    })
  | Extract<ProactivityDecision, { status: "skipped" }>;

export class ProactivityRepositoryError extends Error {
  constructor(
    readonly code: "PROACTIVITY_PREFERENCE_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ProactivityRepositoryError";
  }
}

export interface ProactivityRepositoryPort {
  getDashboard(): Promise<ProactivityDashboard>;
  update(input: UpdateProactivityPreferenceInput): Promise<ProactivityDashboard>;
  evaluate(now: Date): Promise<ProactivityRunResult>;
}

export class ProactivityRepository<TQueryResult extends PgQueryResultHKT>
  implements ProactivityRepositoryPort
{
  constructor(private readonly database: PgDatabase<TQueryResult, typeof schema>) {}

  private async ensureDefaults() {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
    await this.database
      .insert(proactivityPreferences)
      .values({ userId: LOCAL_USER_ID })
      .onConflictDoNothing({ target: proactivityPreferences.userId });
    await this.database
      .insert(notificationPreferences)
      .values({ userId: LOCAL_USER_ID })
      .onConflictDoNothing({ target: notificationPreferences.userId });
  }

  async getDashboard(): Promise<ProactivityDashboard> {
    await this.ensureDefaults();
    const [preferences] = await this.database
      .select()
      .from(proactivityPreferences)
      .where(eq(proactivityPreferences.userId, LOCAL_USER_ID))
      .limit(1);
    const [notification] = await this.database
      .select()
      .from(notificationPreferences)
      .where(eq(notificationPreferences.userId, LOCAL_USER_ID))
      .limit(1);
    if (!preferences || !notification) {
      throw new Error("Proactivity preferences were not persisted.");
    }
    const recentContacts = await this.database
      .select({
        id: proactivityLedger.id,
        userId: proactivityLedger.userId,
        inboxItemId: proactivityLedger.inboxItemId,
        reason: proactivityLedger.reason,
        triggerKey: proactivityLedger.triggerKey,
        triggerRefId: proactivityLedger.triggerRefId,
        rationale: proactivityLedger.rationale,
        policySnapshot: proactivityLedger.policySnapshot,
        createdAt: proactivityLedger.createdAt,
        inboxStatus: inboxItems.status,
      })
      .from(proactivityLedger)
      .leftJoin(inboxItems, eq(proactivityLedger.inboxItemId, inboxItems.id))
      .where(eq(proactivityLedger.userId, LOCAL_USER_ID))
      .orderBy(desc(proactivityLedger.createdAt))
      .limit(20);
    return {
      preferences,
      quietHours: {
        enabled: notification.quietHoursEnabled,
        start: notification.quietStart,
        end: notification.quietEnd,
        timezone: "Asia/Shanghai",
      },
      recentContacts,
    };
  }

  async update(input: UpdateProactivityPreferenceInput): Promise<ProactivityDashboard> {
    await this.ensureDefaults();
    const [updated] = await this.database
      .update(proactivityPreferences)
      .set({
        enabled: input.enabled,
        maxMessagesPerDay: input.maxMessagesPerDay,
        minCooldownHours: input.minCooldownHours,
        checkinAfterDays: input.checkinAfterDays,
        allowedReasons: input.allowedReasons,
        pausedUntil: input.pausedUntil,
        version: sql`${proactivityPreferences.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(proactivityPreferences.userId, LOCAL_USER_ID),
          eq(proactivityPreferences.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!updated) {
      throw new ProactivityRepositoryError(
        "PROACTIVITY_PREFERENCE_VERSION_CONFLICT",
        "Proactivity preferences changed in another client.",
      );
    }
    return this.getDashboard();
  }

  async evaluate(now: Date): Promise<ProactivityRunResult> {
    await this.ensureDefaults();
    return this.database.transaction(async (transaction) => {
      const [preferences] = await transaction
        .select()
        .from(proactivityPreferences)
        .where(eq(proactivityPreferences.userId, LOCAL_USER_ID))
        .for("update")
        .limit(1);
      const [notification] = await transaction
        .select()
        .from(notificationPreferences)
        .where(eq(notificationPreferences.userId, LOCAL_USER_ID))
        .limit(1);
      if (!preferences || !notification) {
        throw new Error("Proactivity policy state is unavailable.");
      }

      const dayStart = shanghaiDayStart(now);
      const [daily] = await transaction
        .select({ count: sql<number>`count(*)::int` })
        .from(proactivityLedger)
        .where(
          and(
            eq(proactivityLedger.userId, LOCAL_USER_ID),
            gte(proactivityLedger.createdAt, dayStart),
          ),
        );
      const [lastContact] = await transaction
        .select({ createdAt: proactivityLedger.createdAt })
        .from(proactivityLedger)
        .where(eq(proactivityLedger.userId, LOCAL_USER_ID))
        .orderBy(desc(proactivityLedger.createdAt))
        .limit(1);
      const [unread] = await transaction
        .select({ id: inboxItems.id })
        .from(inboxItems)
        .where(
          and(
            eq(inboxItems.userId, LOCAL_USER_ID),
            eq(inboxItems.source, "proactive_checkin"),
            eq(inboxItems.status, "unread"),
          ),
        )
        .limit(1);
      const used = await transaction
        .select({ triggerKey: proactivityLedger.triggerKey })
        .from(proactivityLedger)
        .where(
          and(
            eq(proactivityLedger.userId, LOCAL_USER_ID),
            gte(proactivityLedger.createdAt, dayStart),
          ),
        );
      const goals = preferences.allowedReasons.includes("goal_followup")
        ? await transaction
            .select({ id: memoryItems.id, content: memoryItems.content })
            .from(memoryItems)
            .where(
              and(
                eq(memoryItems.userId, LOCAL_USER_ID),
                eq(memoryItems.kind, "goal"),
                ne(memoryItems.sensitivity, "sensitive"),
                or(isNull(memoryItems.validUntil), gt(memoryItems.validUntil, now)),
              ),
            )
            .orderBy(desc(memoryItems.pinned), desc(memoryItems.updatedAt))
            .limit(20)
        : [];
      const [latestUserMessage] = preferences.allowedReasons.includes("checkin")
        ? await transaction
            .select({ id: messages.id, createdAt: messages.createdAt })
            .from(messages)
            .innerJoin(conversations, eq(messages.conversationId, conversations.id))
            .where(
              and(
                eq(conversations.userId, LOCAL_USER_ID),
                eq(messages.role, "user"),
              ),
            )
            .orderBy(desc(messages.createdAt))
            .limit(1)
        : [];
      const [persona] = await transaction
        .select({
          name: personaProfiles.name,
          preferredAddress: personaProfiles.preferredAddress,
        })
        .from(personaProfiles)
        .where(eq(personaProfiles.userId, LOCAL_USER_ID))
        .limit(1);

      const quietHours: ProactivityPolicySnapshot["quietHours"] = {
        enabled: notification.quietHoursEnabled,
        start: notification.quietStart,
        end: notification.quietEnd,
        timezone: "Asia/Shanghai",
      };
      const policy: ProactivityPolicySnapshot = {
        maxMessagesPerDay: preferences.maxMessagesPerDay,
        minCooldownHours: preferences.minCooldownHours,
        checkinAfterDays: preferences.checkinAfterDays,
        allowedReasons: preferences.allowedReasons,
        quietHours,
      };
      const signals: ProactivitySignal[] = [
        ...goals.map((goal) => ({
          reason: "goal_followup" as const,
          refId: goal.id,
          content: goal.content,
        })),
        ...(latestUserMessage
          ? [{
              reason: "checkin" as const,
              refId: latestUserMessage.id,
              lastUserActivityAt: latestUserMessage.createdAt,
            }]
          : []),
      ];
      const decision = evaluateProactivity({
        now,
        enabled: preferences.enabled,
        pausedUntil: preferences.pausedUntil,
        policy,
        sentToday: Number(daily?.count ?? 0),
        lastContactAt: lastContact?.createdAt ?? null,
        hasUnreadContact: Boolean(unread),
        usedTriggerKeys: new Set(used.map((entry) => entry.triggerKey)),
        signals,
        assistantName: persona?.name ?? "知伴",
        preferredAddress: persona?.preferredAddress ?? null,
      });
      if (decision.status === "skipped") return decision;

      const [inboxItem] = await transaction
        .insert(inboxItems)
        .values({
          userId: LOCAL_USER_ID,
          source: "proactive_checkin",
          title: decision.title,
          body: decision.body,
          proactivityReason: decision.reason,
          proactivityRationale: decision.rationale,
          occurredAt: now,
        })
        .returning({ id: inboxItems.id });
      await transaction.insert(proactivityLedger).values({
        userId: LOCAL_USER_ID,
        inboxItemId: inboxItem.id,
        reason: decision.reason,
        triggerKey: decision.triggerKey,
        triggerRefId: decision.triggerRefId,
        rationale: decision.rationale,
        policySnapshot: policy,
        createdAt: now,
      });
      return { ...decision, inboxItemId: inboxItem.id };
    });
  }
}

export function createProactivityRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new ProactivityRepository(database);
}
