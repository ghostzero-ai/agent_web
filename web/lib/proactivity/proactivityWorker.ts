import type {
  ProactivityRepositoryPort,
  ProactivityRunResult,
} from "@/lib/repositories/proactivityRepository";
import { waitForNextPoll } from "@/lib/tasks/reminderWorker";

export type ProactivityWorkerDependencies = {
  repository: Pick<ProactivityRepositoryPort, "evaluate">;
  now?: () => Date;
};

export async function runProactivityBatch(
  dependencies: ProactivityWorkerDependencies,
): Promise<ProactivityRunResult> {
  return dependencies.repository.evaluate((dependencies.now ?? (() => new Date()))());
}

export async function runProactivityWorker(
  dependencies: ProactivityWorkerDependencies,
  options: {
    pollIntervalMs: number;
    signal: AbortSignal;
    onResult?: (result: ProactivityRunResult) => void;
    onError?: (error: unknown) => void;
  },
): Promise<void> {
  while (!options.signal.aborted) {
    try {
      options.onResult?.(await runProactivityBatch(dependencies));
    } catch (error) {
      options.onError?.(error);
    }
    await waitForNextPoll(options.pollIntervalMs, options.signal);
  }
}
