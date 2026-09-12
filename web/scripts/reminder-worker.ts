import { hostname } from "node:os";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { createPushConfigurationService } from "../lib/notifications/pushConfigurationService";
import { PushProviderRegistry } from "../lib/notifications/pushProvider";
import { createWebPushProvider } from "../lib/notifications/webPushProvider";
import { runNotificationWorker } from "../lib/notifications/notificationWorker";
import { createInboxRepository } from "../lib/repositories/inboxRepository";
import { createNotificationDeliveryRepository } from "../lib/repositories/notificationDeliveryRepository";
import { createNotificationRepository } from "../lib/repositories/notificationRepository";
import { createSchedulerRepository } from "../lib/repositories/schedulerRepository";
import { createAgentPromptGenerator } from "../lib/tasks/agentPromptGenerator";
import { runReminderWorker } from "../lib/tasks/reminderWorker";

function integerSetting(
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const workerId =
    process.env.REMINDER_WORKER_ID?.trim() || `${hostname()}-${process.pid}`;
  const batchSize = integerSetting("SCHEDULER_BATCH_SIZE", 20, 1, 100);
  const leaseDurationMs = integerSetting(
    "SCHEDULER_LEASE_MS",
    60_000,
    5_000,
    15 * 60_000,
  );
  const pollIntervalMs = integerSetting(
    "REMINDER_POLL_INTERVAL_MS",
    5_000,
    1_000,
    5 * 60_000,
  );
  const abortController = new AbortController();
  const stop = () => abortController.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  const client = postgres(databaseUrl, { max: 2 });
  const database = drizzle(client, { schema });
  console.log(JSON.stringify({ event: "reminder-worker-started", workerId }));

  try {
    const notificationRepository = createNotificationRepository(database);
    const pushConfiguration = createPushConfigurationService(
      notificationRepository,
    );
    const pushProviders = new PushProviderRegistry([
      createWebPushProvider(pushConfiguration.getOrCreateConfiguration),
    ]);
    await Promise.all([
      runReminderWorker(
        {
          scheduler: createSchedulerRepository(database),
          inbox: createInboxRepository(database),
          agent: createAgentPromptGenerator(),
          onRunDeferred(runId, error) {
            console.error(
              JSON.stringify({
                event: "reminder-run-deferred",
                workerId,
                runId,
                error: errorName(error),
              }),
            );
          },
          onRunFailed(runId, errorCode) {
            console.error(
              JSON.stringify({
                event: "agent-run-failed",
                workerId,
                runId,
                errorCode,
              }),
            );
          },
        },
        {
          workerId,
          batchSize,
          leaseDurationMs,
          pollIntervalMs,
          signal: abortController.signal,
          onBatch(result) {
            if (result.claimed > 0) {
              console.log(
                JSON.stringify({
                  event: "reminder-batch-finished",
                  workerId,
                  ...result,
                }),
              );
            }
          },
          onBatchError(error) {
            console.error(
              JSON.stringify({
                event: "reminder-batch-deferred",
                workerId,
                error: errorName(error),
              }),
            );
          },
        },
      ),
      runNotificationWorker(
        {
          deliveries: createNotificationDeliveryRepository(database),
          providers: pushProviders,
          onDeliveryError(deliveryId, errorCode) {
            console.error(
              JSON.stringify({
                event: "push-delivery-deferred",
                workerId,
                deliveryId,
                errorCode,
              }),
            );
          },
        },
        {
          workerId,
          batchSize,
          leaseDurationMs,
          pollIntervalMs,
          signal: abortController.signal,
          onBatch(result) {
            if (result.plannedInboxItems > 0 || result.claimed > 0) {
              console.log(
                JSON.stringify({
                  event: "push-batch-finished",
                  workerId,
                  ...result,
                }),
              );
            }
          },
          onBatchError(error) {
            console.error(
              JSON.stringify({
                event: "push-batch-deferred",
                workerId,
                error: errorName(error),
              }),
            );
          },
        },
      ),
    ]);
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    `Reminder worker failed: ${error instanceof Error ? error.name : "UnknownError"}`,
  );
  process.exitCode = 1;
});
