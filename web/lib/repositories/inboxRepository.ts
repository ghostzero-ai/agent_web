import { and, desc, eq, gt } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  inboxItems,
  scheduledTasks,
  taskRuns,
  type InboxItemRecord,
  type TaskRunRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type InboxFilter = "all" | "unread" | "read";

export type CompleteReminderRunInput = {
  runId: string;
  workerId: string;
  expectedAttempt: number;
  now: Date;
};

export type CompletedReminderRun = {
  inboxItem: InboxItemRecord;
  run: TaskRunRecord;
};

export class InboxRepositoryError extends Error {
  constructor(
    readonly code:
      | "INBOX_ITEM_NOT_FOUND"
      | "RUN_LEASE_LOST"
      | "INBOX_WRITE_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "InboxRepositoryError";
  }
}

export interface InboxRepositoryPort {
  list(filter?: InboxFilter): Promise<InboxItemRecord[]>;
  markStatus(
    id: string,
    status: "unread" | "read",
    now: Date,
  ): Promise<InboxItemRecord>;
  delete(id: string): Promise<boolean>;
  completeReminderRun(
    input: CompleteReminderRunInput,
  ): Promise<CompletedReminderRun>;
}

export class InboxRepository<
  TQueryResult extends PgQueryResultHKT,
> implements InboxRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  list(filter: InboxFilter = "all"): Promise<InboxItemRecord[]> {
    const condition =
      filter === "all"
        ? eq(inboxItems.userId, LOCAL_USER_ID)
        : and(
            eq(inboxItems.userId, LOCAL_USER_ID),
            eq(inboxItems.status, filter),
          );
    return this.database
      .select()
      .from(inboxItems)
      .where(condition)
      .orderBy(desc(inboxItems.occurredAt), desc(inboxItems.createdAt));
  }

  async markStatus(
    id: string,
    status: "unread" | "read",
    now: Date,
  ): Promise<InboxItemRecord> {
    const [item] = await this.database
      .update(inboxItems)
      .set({
        status,
        readAt: status === "read" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(inboxItems.id, id),
          eq(inboxItems.userId, LOCAL_USER_ID),
        ),
      )
      .returning();
    if (!item) {
      throw new InboxRepositoryError(
        "INBOX_ITEM_NOT_FOUND",
        "Inbox item was not found.",
      );
    }
    return item;
  }

  async delete(id: string): Promise<boolean> {
    const deleted = await this.database
      .delete(inboxItems)
      .where(
        and(
          eq(inboxItems.id, id),
          eq(inboxItems.userId, LOCAL_USER_ID),
        ),
      )
      .returning({ id: inboxItems.id });
    return deleted.length > 0;
  }

  completeReminderRun(
    input: CompleteReminderRunInput,
  ): Promise<CompletedReminderRun> {
    return this.database.transaction(async (transaction) => {
      const [owned] = await transaction
        .select({
          run: taskRuns,
          task: {
            id: scheduledTasks.id,
            userId: scheduledTasks.userId,
            title: scheduledTasks.title,
            prompt: scheduledTasks.prompt,
          },
        })
        .from(taskRuns)
        .innerJoin(scheduledTasks, eq(taskRuns.taskId, scheduledTasks.id))
        .where(
          and(
            eq(taskRuns.id, input.runId),
            eq(taskRuns.status, "running"),
            eq(taskRuns.claimedBy, input.workerId),
            eq(taskRuns.attempt, input.expectedAttempt),
            gt(taskRuns.leaseExpiresAt, input.now),
          ),
        )
        .for("update")
        .limit(1);
      if (!owned) {
        throw new InboxRepositoryError(
          "RUN_LEASE_LOST",
          "Run is no longer owned by this worker attempt.",
        );
      }

      const [created] = await transaction
        .insert(inboxItems)
        .values({
          userId: owned.task.userId,
          taskId: owned.task.id,
          taskRunId: owned.run.id,
          title: owned.task.title,
          body: owned.task.prompt,
          occurredAt: owned.run.scheduledFor,
        })
        .onConflictDoNothing({ target: inboxItems.taskRunId })
        .returning();
      const inboxItem =
        created ??
        (
          await transaction
            .select()
            .from(inboxItems)
            .where(
              and(
                eq(inboxItems.taskRunId, owned.run.id),
                eq(inboxItems.userId, owned.task.userId),
              ),
            )
            .limit(1)
        )[0];
      if (!inboxItem) {
        throw new InboxRepositoryError(
          "INBOX_WRITE_FAILED",
          "Reminder inbox item could not be persisted.",
        );
      }

      const [run] = await transaction
        .update(taskRuns)
        .set({
          status: "succeeded",
          leaseExpiresAt: null,
          finishedAt: input.now,
          resultSummary: "Reminder stored in durable inbox.",
          errorCode: null,
          errorMessage: null,
          updatedAt: input.now,
        })
        .where(
          and(
            eq(taskRuns.id, input.runId),
            eq(taskRuns.status, "running"),
            eq(taskRuns.claimedBy, input.workerId),
            eq(taskRuns.attempt, input.expectedAttempt),
            gt(taskRuns.leaseExpiresAt, input.now),
          ),
        )
        .returning();
      if (!run) {
        throw new InboxRepositoryError(
          "RUN_LEASE_LOST",
          "Run lease was lost before reminder completion.",
        );
      }

      return { inboxItem, run };
    });
  }
}

export function createInboxRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new InboxRepository(database);
}
