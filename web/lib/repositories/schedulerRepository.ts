import {
  and,
  asc,
  eq,
  gt,
  inArray,
  isNotNull,
  lte,
  sql,
} from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  scheduledTasks,
  taskRuns,
  type ScheduledTaskRecord,
  type TaskRunRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { nextRecurringRunAt } from "@/lib/tasks/schedule";

export type ClaimRunsInput = {
  workerId: string;
  now: Date;
  leaseDurationMs: number;
  limit: number;
};

export type ClaimedTaskRun = {
  source: "new" | "reclaimed";
  run: TaskRunRecord;
  task: ScheduledTaskRecord;
};

export type FinishRunInput = {
  runId: string;
  workerId: string;
  expectedAttempt: number;
  now: Date;
  outcome:
    | { status: "succeeded"; resultSummary?: string | null }
    | { status: "failed"; errorCode: string; errorMessage: string };
};

export class SchedulerRepositoryError extends Error {
  constructor(
    readonly code:
      | "INVALID_CLAIM_OPTIONS"
      | "TASK_ADVANCE_FAILED"
      | "RUN_LEASE_LOST",
    message: string,
  ) {
    super(message);
    this.name = "SchedulerRepositoryError";
  }
}

function validateClaimInput(input: ClaimRunsInput): void {
  if (!input.workerId.trim() || input.workerId.length > 200) {
    throw new SchedulerRepositoryError(
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
    throw new SchedulerRepositoryError(
      "INVALID_CLAIM_OPTIONS",
      "Claim limit or lease duration is outside the supported range.",
    );
  }
}

function leaseUntil(input: Pick<ClaimRunsInput, "now" | "leaseDurationMs">) {
  return new Date(input.now.getTime() + input.leaseDurationMs);
}

export class SchedulerRepository<
  TQueryResult extends PgQueryResultHKT,
> {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async claimAvailableRuns(input: ClaimRunsInput): Promise<ClaimedTaskRun[]> {
    validateClaimInput(input);
    const nextLease = leaseUntil(input);

    return this.database.transaction(async (transaction) => {
      const claimed: ClaimedTaskRun[] = [];
      const expired = await transaction
        .select()
        .from(taskRuns)
        .where(
          and(
            inArray(taskRuns.status, ["claimed", "running"]),
            isNotNull(taskRuns.leaseExpiresAt),
            lte(taskRuns.leaseExpiresAt, input.now),
          ),
        )
        .orderBy(asc(taskRuns.scheduledFor), asc(taskRuns.id))
        .limit(input.limit)
        .for("update", { skipLocked: true });

      for (const staleRun of expired) {
        const [run] = await transaction
          .update(taskRuns)
          .set({
            status: "claimed",
            attempt: sql`${taskRuns.attempt} + 1`,
            claimedBy: input.workerId,
            leaseExpiresAt: nextLease,
            startedAt: null,
            finishedAt: null,
            resultSummary: null,
            errorCode: null,
            errorMessage: null,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(taskRuns.id, staleRun.id),
              eq(taskRuns.attempt, staleRun.attempt),
              inArray(taskRuns.status, ["claimed", "running"]),
              lte(taskRuns.leaseExpiresAt, input.now),
            ),
          )
          .returning();
        if (!run) continue;

        const [task] = await transaction
          .select()
          .from(scheduledTasks)
          .where(eq(scheduledTasks.id, run.taskId))
          .limit(1);
        if (task) claimed.push({ source: "reclaimed", run, task });
      }

      const remaining = input.limit - claimed.length;
      if (remaining === 0) return claimed;

      const dueTasks = await transaction
        .select()
        .from(scheduledTasks)
        .where(
          and(
            eq(scheduledTasks.status, "active"),
            isNotNull(scheduledTasks.nextRunAt),
            lte(scheduledTasks.nextRunAt, input.now),
          ),
        )
        .orderBy(asc(scheduledTasks.nextRunAt), asc(scheduledTasks.id))
        .limit(remaining)
        .for("update", { skipLocked: true });

      for (const task of dueTasks) {
        const scheduledFor = task.nextRunAt;
        if (!scheduledFor) continue;

        const [run] = await transaction
          .insert(taskRuns)
          .values({
            taskId: task.id,
            scheduledFor,
            status: "claimed",
            claimedBy: input.workerId,
            leaseExpiresAt: nextLease,
          })
          .onConflictDoNothing({
            target: [taskRuns.taskId, taskRuns.scheduledFor],
          })
          .returning();

        let nextRunAt: Date | null = null;
        if (
          task.scheduleType === "daily" ||
          task.scheduleType === "weekly"
        ) {
          nextRunAt = nextRecurringRunAt(
            task.scheduleType,
            task.scheduleValue,
            input.now,
          );
        }
        const recurring = nextRunAt !== null;
        const [updatedTask] = await transaction
          .update(scheduledTasks)
          .set({
            status: recurring ? "active" : "completed",
            nextRunAt,
            version: sql`${scheduledTasks.version} + 1`,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(scheduledTasks.id, task.id),
              eq(scheduledTasks.status, "active"),
              eq(scheduledTasks.version, task.version),
            ),
          )
          .returning();

        if (!updatedTask) {
          throw new SchedulerRepositoryError(
            "TASK_ADVANCE_FAILED",
            "Task changed while its scheduled run was being created.",
          );
        }
        if (run) {
          claimed.push({ source: "new", run, task: updatedTask });
        }
      }

      return claimed;
    });
  }

  async markRunRunning(
    runId: string,
    workerId: string,
    expectedAttempt: number,
    now: Date,
    leaseDurationMs: number,
  ): Promise<TaskRunRecord> {
    const [run] = await this.database
      .update(taskRuns)
      .set({
        status: "running",
        startedAt: now,
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        updatedAt: now,
      })
      .where(
        and(
          eq(taskRuns.id, runId),
          eq(taskRuns.status, "claimed"),
          eq(taskRuns.claimedBy, workerId),
          eq(taskRuns.attempt, expectedAttempt),
          gt(taskRuns.leaseExpiresAt, now),
        ),
      )
      .returning();
    return this.requireOwnedRun(run);
  }

  async renewRunLease(
    runId: string,
    workerId: string,
    expectedAttempt: number,
    now: Date,
    leaseDurationMs: number,
  ): Promise<TaskRunRecord> {
    const [run] = await this.database
      .update(taskRuns)
      .set({
        leaseExpiresAt: new Date(now.getTime() + leaseDurationMs),
        updatedAt: now,
      })
      .where(
        and(
          eq(taskRuns.id, runId),
          inArray(taskRuns.status, ["claimed", "running"]),
          eq(taskRuns.claimedBy, workerId),
          eq(taskRuns.attempt, expectedAttempt),
          gt(taskRuns.leaseExpiresAt, now),
        ),
      )
      .returning();
    return this.requireOwnedRun(run);
  }

  async finishRun(input: FinishRunInput): Promise<TaskRunRecord> {
    const terminalFields =
      input.outcome.status === "succeeded"
        ? {
            resultSummary: input.outcome.resultSummary ?? null,
            errorCode: null,
            errorMessage: null,
          }
        : {
            resultSummary: null,
            errorCode: input.outcome.errorCode,
            errorMessage: input.outcome.errorMessage,
          };
    const [run] = await this.database
      .update(taskRuns)
      .set({
        status: input.outcome.status,
        leaseExpiresAt: null,
        finishedAt: input.now,
        ...terminalFields,
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
    return this.requireOwnedRun(run);
  }

  private requireOwnedRun(run: TaskRunRecord | undefined): TaskRunRecord {
    if (!run) {
      throw new SchedulerRepositoryError(
        "RUN_LEASE_LOST",
        "Run is no longer owned by this worker attempt.",
      );
    }
    return run;
  }
}

export function createSchedulerRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return new SchedulerRepository(database);
}
