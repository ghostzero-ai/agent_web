import type {
  ClaimedTaskRun,
  ClaimRunsInput,
  FinishRunInput,
} from "@/lib/repositories/schedulerRepository";
import type {
  CompleteAgentPromptRunInput,
  CompleteReminderRunInput,
  CompletedReminderRun,
} from "@/lib/repositories/inboxRepository";
import type { TaskRunRecord } from "@/lib/db/schema";
import {
  AgentPromptGenerationError,
  type AgentPromptGeneratorPort,
  type AgentPromptResult,
} from "@/lib/tasks/agentPromptGenerator";

export type ReminderWorkerOptions = {
  workerId: string;
  batchSize: number;
  leaseDurationMs: number;
};

export type ReminderBatchResult = {
  claimed: number;
  completed: number;
  failed: number;
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
  renewRunLease(
    runId: string,
    workerId: string,
    expectedAttempt: number,
    now: Date,
    leaseDurationMs: number,
  ): Promise<TaskRunRecord>;
  finishRun(input: FinishRunInput): Promise<TaskRunRecord>;
}

export interface ReminderInboxPort {
  completeReminderRun(
    input: CompleteReminderRunInput,
  ): Promise<CompletedReminderRun>;
  completeAgentPromptRun(
    input: CompleteAgentPromptRunInput,
  ): Promise<CompletedReminderRun>;
}

export type ReminderWorkerDependencies = {
  scheduler: ReminderSchedulerPort;
  inbox: ReminderInboxPort;
  agent: AgentPromptGeneratorPort;
  now?: () => Date;
  onRunDeferred?: (runId: string, error: unknown) => void;
  onRunFailed?: (runId: string, errorCode: string) => void;
};

type RunOutcome = "completed" | "failed" | "deferred";

async function generateWithLeaseHeartbeat(
  dependencies: ReminderWorkerDependencies,
  options: ReminderWorkerOptions & { signal?: AbortSignal },
  running: TaskRunRecord,
  prompt: string,
): Promise<AgentPromptResult> {
  const controller = new AbortController();
  const abortFromWorker = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) abortFromWorker();
  else options.signal?.addEventListener("abort", abortFromWorker, { once: true });

  let leaseError: unknown;
  const heartbeatMs = Math.max(1_000, Math.floor(options.leaseDurationMs / 3));
  const heartbeat = (async () => {
    while (!controller.signal.aborted) {
      await waitForNextPoll(heartbeatMs, controller.signal);
      if (controller.signal.aborted) break;
      try {
        await dependencies.scheduler.renewRunLease(
          running.id,
          options.workerId,
          running.attempt,
          (dependencies.now ?? (() => new Date()))(),
          options.leaseDurationMs,
        );
      } catch (error) {
        leaseError = error;
        controller.abort(error);
      }
    }
  })();

  try {
    const result = await dependencies.agent.generate(prompt, controller.signal);
    if (leaseError) throw leaseError;
    await dependencies.scheduler.renewRunLease(
      running.id,
      options.workerId,
      running.attempt,
      (dependencies.now ?? (() => new Date()))(),
      options.leaseDurationMs,
    );
    return result;
  } finally {
    controller.abort("Agent task generation finished.");
    options.signal?.removeEventListener("abort", abortFromWorker);
    await heartbeat;
  }
}

async function failTerminalAgentRun(
  dependencies: ReminderWorkerDependencies,
  options: ReminderWorkerOptions,
  running: TaskRunRecord,
  error: AgentPromptGenerationError,
): Promise<RunOutcome> {
  try {
    await dependencies.scheduler.finishRun({
      runId: running.id,
      workerId: options.workerId,
      expectedAttempt: running.attempt,
      now: (dependencies.now ?? (() => new Date()))(),
      outcome: {
        status: "failed",
        errorCode: error.code,
        errorMessage: error.message,
      },
    });
    dependencies.onRunFailed?.(running.id, error.code);
    return "failed";
  } catch (finishError) {
    dependencies.onRunDeferred?.(running.id, finishError);
    return "deferred";
  }
}

async function executeClaim(
  dependencies: ReminderWorkerDependencies,
  options: ReminderWorkerOptions & { signal?: AbortSignal },
  claim: ClaimedTaskRun,
): Promise<RunOutcome> {
  let running: TaskRunRecord;
  try {
    running = await dependencies.scheduler.markRunRunning(
      claim.run.id,
      options.workerId,
      claim.run.attempt,
      (dependencies.now ?? (() => new Date()))(),
      options.leaseDurationMs,
    );
  } catch (error) {
    dependencies.onRunDeferred?.(claim.run.id, error);
    return "deferred";
  }

  if (claim.task.kind === "reminder") {
    try {
      await dependencies.inbox.completeReminderRun({
        runId: running.id,
        workerId: options.workerId,
        expectedAttempt: running.attempt,
        now: (dependencies.now ?? (() => new Date()))(),
      });
      return "completed";
    } catch (error) {
      dependencies.onRunDeferred?.(running.id, error);
      return "deferred";
    }
  }

  const prompt = claim.task.prompt?.trim();
  if (!prompt) {
    return failTerminalAgentRun(
      dependencies,
      options,
      running,
      new AgentPromptGenerationError(
        "AGENT_PROMPT_MISSING",
        "Agent Prompt task has no prompt.",
        false,
      ),
    );
  }

  try {
    const generated = await generateWithLeaseHeartbeat(
      dependencies,
      options,
      running,
      prompt,
    );
    await dependencies.inbox.completeAgentPromptRun({
      runId: running.id,
      workerId: options.workerId,
      expectedAttempt: running.attempt,
      now: (dependencies.now ?? (() => new Date()))(),
      content: generated.content,
      model: generated.model,
    });
    return "completed";
  } catch (error) {
    if (error instanceof AgentPromptGenerationError && !error.retryable) {
      return failTerminalAgentRun(dependencies, options, running, error);
    }
    dependencies.onRunDeferred?.(running.id, error);
    return "deferred";
  }
}

export async function runReminderBatch(
  dependencies: ReminderWorkerDependencies,
  options: ReminderWorkerOptions & { signal?: AbortSignal },
): Promise<ReminderBatchResult> {
  const now = dependencies.now ?? (() => new Date());
  const claimed = await dependencies.scheduler.claimAvailableRuns({
    workerId: options.workerId,
    now: now(),
    leaseDurationMs: options.leaseDurationMs,
    limit: options.batchSize,
  });
  const outcomes = await Promise.all(
    claimed.map((claim) => executeClaim(dependencies, options, claim)),
  );

  return {
    claimed: claimed.length,
    completed: outcomes.filter((outcome) => outcome === "completed").length,
    failed: outcomes.filter((outcome) => outcome === "failed").length,
    deferred: outcomes.filter((outcome) => outcome === "deferred").length,
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
