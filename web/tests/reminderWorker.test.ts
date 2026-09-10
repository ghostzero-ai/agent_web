import { describe, expect, it, vi } from "vitest";
import type { TaskRunRecord } from "@/lib/db/schema";
import {
  runReminderBatch,
  runReminderWorker,
  type ReminderInboxPort,
  type ReminderSchedulerPort,
} from "@/lib/tasks/reminderWorker";

function run(id: string, attempt = 1): TaskRunRecord {
  const at = new Date("2026-09-10T01:00:00.000Z");
  return {
    id,
    taskId: `task-${id}`,
    scheduledFor: at,
    status: "claimed",
    attempt,
    claimedBy: "worker-a",
    leaseExpiresAt: new Date("2026-09-10T01:01:00.000Z"),
    startedAt: null,
    finishedAt: null,
    resultSummary: null,
    errorCode: null,
    errorMessage: null,
    notifiedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

function task(id: string) {
  const at = new Date("2026-09-10T01:00:00.000Z");
  return {
    id: `task-${id}`,
    userId: "local-user",
    title: `Reminder ${id}`,
    prompt: `Body ${id}`,
    scheduleType: "once" as const,
    scheduleValue: { runAt: at.toISOString() },
    timezone: "Asia/Shanghai",
    status: "completed" as const,
    nextRunAt: null,
    lastScheduledAt: null,
    version: 2,
    createdAt: at,
    updatedAt: at,
  };
}

describe("reminder worker", () => {
  it("moves each claimed run through running to durable completion", async () => {
    const claims = [run("one"), run("two")];
    const scheduler: ReminderSchedulerPort = {
      claimAvailableRuns: vi.fn().mockResolvedValue(
        claims.map((item) => ({ source: "new", run: item, task: task(item.id) })),
      ),
      markRunRunning: vi.fn().mockImplementation(async (...args) => ({
        ...claims.find((item) => item.id === args[0]),
        status: "running",
        startedAt: args[3],
      })),
    };
    const inbox: ReminderInboxPort = {
      completeReminderRun: vi.fn().mockResolvedValue({}),
    } as unknown as ReminderInboxPort;

    const result = await runReminderBatch(
      { scheduler, inbox, now: () => new Date("2026-09-10T01:00:01.000Z") },
      { workerId: "worker-a", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toEqual({ claimed: 2, completed: 2, deferred: 0 });
    expect(scheduler.markRunRunning).toHaveBeenCalledTimes(2);
    expect(inbox.completeReminderRun).toHaveBeenCalledTimes(2);
  });

  it("defers one failed run without blocking the rest of the batch", async () => {
    const claims = [run("one"), run("two")];
    const deferred = vi.fn();
    const scheduler: ReminderSchedulerPort = {
      claimAvailableRuns: vi.fn().mockResolvedValue(
        claims.map((item) => ({ source: "new", run: item, task: task(item.id) })),
      ),
      markRunRunning: vi
        .fn()
        .mockRejectedValueOnce(new Error("lease lost"))
        .mockResolvedValueOnce({ ...claims[1], status: "running" }),
    };
    const inbox = {
      completeReminderRun: vi.fn().mockResolvedValue({}),
    } as unknown as ReminderInboxPort;

    const result = await runReminderBatch(
      { scheduler, inbox, onRunDeferred: deferred },
      { workerId: "worker-a", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toEqual({ claimed: 2, completed: 1, deferred: 1 });
    expect(deferred).toHaveBeenCalledWith("one", expect.any(Error));
    expect(inbox.completeReminderRun).toHaveBeenCalledTimes(1);
  });

  it("stops an idle polling loop immediately when aborted", async () => {
    const abortController = new AbortController();
    const scheduler = {
      claimAvailableRuns: vi.fn().mockImplementation(async () => {
        abortController.abort();
        return [];
      }),
      markRunRunning: vi.fn(),
    } as unknown as ReminderSchedulerPort;

    await runReminderWorker(
      { scheduler, inbox: {} as ReminderInboxPort },
      {
        workerId: "worker-a",
        batchSize: 20,
        leaseDurationMs: 60_000,
        pollIntervalMs: 300_000,
        signal: abortController.signal,
      },
    );

    expect(scheduler.claimAvailableRuns).toHaveBeenCalledTimes(1);
  });
});
