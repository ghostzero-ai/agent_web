import type {
  ClaimedTaskRun,
  ClaimRunsInput,
} from "@/lib/repositories/schedulerRepository";
import type {
  CompleteReminderRunInput,
  CompletedReminderRun,
} from "@/lib/repositories/inboxRepository";
import type { TaskRunRecord } from "@/lib/db/schema";

export type ReminderWorkerOptions = {
  workerId: string;
  batchSize: number;
  leaseDurationMs: number;
};

export type ReminderBatchResult = {
  claimed: number;
  completed: number;
  deferred: number;
};

export interface ReminderSchedulerPort {
  claimAvailableRuns(input: ClaimRunsInput): Promise<ClaimedTaskRun[]>;
  markRunRunning(
    runId: string,
    workerId: string,
    expectedAttempt: number,
    now: Date,
    leaseDurationMs: number,
  ): Promise<TaskRunRecord>;
}

export interface ReminderInboxPort {
  completeReminderRun(
    input: CompleteReminderRunInput,
  ): Promise<CompletedReminderRun>;
}

export type ReminderWorkerDependencies = {
  scheduler: ReminderSchedulerPort;
  inbox: ReminderInboxPort;
  now?: () => Date;
  onRunDeferred?: (runId: string, error: unknown) => void;
};

export async function runReminderBatch(
  dependencies: ReminderWorkerDependencies,
  options: ReminderWorkerOptions,
): Promise<ReminderBatchResult> {
  const now = dependencies.now ?? (() => new Date());
  const claimed = await dependencies.scheduler.claimAvailableRuns({
    workerId: options.workerId,
    now: now(),
    leaseDurationMs: options.leaseDurationMs,
    limit: options.batchSize,
  });
  let completed = 0;

  for (const { run } of claimed) {
    try {
      const running = await dependencies.scheduler.markRunRunning(
        run.id,
        options.workerId,
        run.attempt,
        now(),
        options.leaseDurationMs,
      );
      await dependencies.inbox.completeReminderRun({
        runId: running.id,
        workerId: options.workerId,
        expectedAttempt: running.attempt,
        now: now(),
      });
      completed += 1;
    } catch (error) {
      dependencies.onRunDeferred?.(run.id, error);
    }
  }

  return {
    claimed: claimed.length,
    completed,
    deferred: claimed.length - completed,
  };
}

export function waitForNextPoll(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });

    function finish() {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve();
    }
  });
}

export async function runReminderWorker(
  dependencies: ReminderWorkerDependencies,
  options: ReminderWorkerOptions & {
    pollIntervalMs: number;
    signal: AbortSignal;
    onBatch?: (result: ReminderBatchResult) => void;
    onBatchError?: (error: unknown) => void;
  },
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      const result = await runReminderBatch(dependencies, options);
      options.onBatch?.(result);
    } catch (error) {
      options.onBatchError?.(error);
    }
    await waitForNextPoll(options.pollIntervalMs, options.signal);
  }
}
