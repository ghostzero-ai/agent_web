import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskRunRecord } from "@/lib/db/schema";
import {
  runReminderBatch,
  runReminderWorker,
  type ReminderInboxPort,
  type ReminderSchedulerPort,
} from "@/lib/tasks/reminderWorker";
import {
  AgentPromptGenerationError,
  type AgentPromptGeneratorPort,
} from "@/lib/tasks/agentPromptGenerator";

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

function task(id: string, kind: "reminder" | "agent_prompt" = "reminder") {
  const at = new Date("2026-09-10T01:00:00.000Z");
  return {
    id: `task-${id}`,
    userId: "local-user",
    title: `Reminder ${id}`,
    prompt: kind === "agent_prompt" ? `Generate ${id}` : `Body ${id}`,
    kind,
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

function agent(
  implementation: AgentPromptGeneratorPort["generate"] = vi
    .fn()
    .mockResolvedValue({ content: "Generated result", model: "test-model" }),
): AgentPromptGeneratorPort {
  return { generate: implementation };
}

describe("reminder worker", () => {
  afterEach(() => vi.useRealTimers());

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
      renewRunLease: vi.fn(),
      finishRun: vi.fn(),
    };
    const inbox: ReminderInboxPort = {
      completeReminderRun: vi.fn().mockResolvedValue({}),
      completeAgentPromptRun: vi.fn(),
    } as unknown as ReminderInboxPort;

    const result = await runReminderBatch(
      { scheduler, inbox, agent: agent(), now: () => new Date("2026-09-10T01:00:01.000Z") },
      { workerId: "worker-a", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toEqual({ claimed: 2, completed: 2, failed: 0, deferred: 0 });
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
      renewRunLease: vi.fn(),
      finishRun: vi.fn(),
    };
    const inbox = {
      completeReminderRun: vi.fn().mockResolvedValue({}),
      completeAgentPromptRun: vi.fn(),
    } as unknown as ReminderInboxPort;

    const result = await runReminderBatch(
      { scheduler, inbox, agent: agent(), onRunDeferred: deferred },
      { workerId: "worker-a", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toEqual({ claimed: 2, completed: 1, failed: 0, deferred: 1 });
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
      renewRunLease: vi.fn(),
      finishRun: vi.fn(),
    } as unknown as ReminderSchedulerPort;

    await runReminderWorker(
      { scheduler, inbox: {} as ReminderInboxPort, agent: agent() },
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

  it("generates an Agent Prompt result, renews its lease and stores it in Inbox", async () => {
    vi.useFakeTimers();
    const claimedRun = run("agent");
    const scheduler: ReminderSchedulerPort = {
      claimAvailableRuns: vi.fn().mockResolvedValue([
        { source: "new", run: claimedRun, task: task("agent", "agent_prompt") },
      ]),
      markRunRunning: vi.fn().mockResolvedValue({
        ...claimedRun,
        status: "running",
      }),
      renewRunLease: vi.fn().mockResolvedValue(claimedRun),
      finishRun: vi.fn(),
    };
    const inbox = {
      completeReminderRun: vi.fn(),
      completeAgentPromptRun: vi.fn().mockResolvedValue({}),
    } as unknown as ReminderInboxPort;
    const generate = vi.fn().mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      return { content: "# 今日总结", model: "test-model" };
    });

    const pending = runReminderBatch(
      { scheduler, inbox, agent: agent(generate) },
      { workerId: "worker-a", batchSize: 20, leaseDurationMs: 3_000 },
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await expect(pending).resolves.toEqual({
      claimed: 1,
      completed: 1,
      failed: 0,
      deferred: 0,
    });
    expect(vi.mocked(scheduler.renewRunLease).mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(inbox.completeAgentPromptRun).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "# 今日总结",
        model: "test-model",
      }),
    );
  });

  it("records a non-retryable Agent failure on the TaskRun", async () => {
    const claimedRun = run("failed-agent");
    const finishRun = vi.fn().mockResolvedValue({ ...claimedRun, status: "failed" });
    const scheduler: ReminderSchedulerPort = {
      claimAvailableRuns: vi.fn().mockResolvedValue([
        {
          source: "new",
          run: claimedRun,
          task: task("failed-agent", "agent_prompt"),
        },
      ]),
      markRunRunning: vi.fn().mockResolvedValue({ ...claimedRun, status: "running" }),
      renewRunLease: vi.fn(),
      finishRun,
    };
    const failure = new AgentPromptGenerationError(
      "MODEL_CONFIGURATION_ERROR",
      "Server model provider is not configured.",
      false,
    );
    const result = await runReminderBatch(
      {
        scheduler,
        inbox: {} as ReminderInboxPort,
        agent: agent(vi.fn().mockRejectedValue(failure)),
      },
      { workerId: "worker-a", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 1, deferred: 0 });
    expect(finishRun).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: expect.objectContaining({
          status: "failed",
          errorCode: "MODEL_CONFIGURATION_ERROR",
        }),
      }),
    );
  });

  it("leaves a retryable Agent failure available for lease-based recovery", async () => {
    const claimedRun = run("retry-agent");
    const finishRun = vi.fn();
    const deferred = vi.fn();
    const scheduler: ReminderSchedulerPort = {
      claimAvailableRuns: vi.fn().mockResolvedValue([
        {
          source: "new",
          run: claimedRun,
          task: task("retry-agent", "agent_prompt"),
        },
      ]),
      markRunRunning: vi.fn().mockResolvedValue({ ...claimedRun, status: "running" }),
      renewRunLease: vi.fn(),
      finishRun,
    };
    const failure = new AgentPromptGenerationError(
      "PROVIDER_RATE_LIMITED",
      "Model provider rate limit was reached.",
      true,
    );
    const result = await runReminderBatch(
      {
        scheduler,
        inbox: {} as ReminderInboxPort,
        agent: agent(vi.fn().mockRejectedValue(failure)),
        onRunDeferred: deferred,
      },
      { workerId: "worker-a", batchSize: 20, leaseDurationMs: 60_000 },
    );

    expect(result).toEqual({ claimed: 1, completed: 0, failed: 0, deferred: 1 });
    expect(finishRun).not.toHaveBeenCalled();
    expect(deferred).toHaveBeenCalledWith("retry-agent", failure);
  });
});
