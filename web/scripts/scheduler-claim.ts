import { hostname } from "node:os";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../lib/db/schema";
import { createSchedulerRepository } from "../lib/repositories/schedulerRepository";

function integerSetting(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  return parsed;
}

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const workerId =
    process.env.SCHEDULER_WORKER_ID?.trim() ||
    `${hostname()}-${process.pid}`;
  const limit = integerSetting("SCHEDULER_BATCH_SIZE", 20);
  const leaseDurationMs = integerSetting("SCHEDULER_LEASE_MS", 60_000);
  const client = postgres(databaseUrl, { max: 2 });

  try {
    const scheduler = createSchedulerRepository(
      drizzle(client, { schema }),
    );
    const claimed = await scheduler.claimAvailableRuns({
      workerId,
      now: new Date(),
      leaseDurationMs,
      limit,
    });
    console.log(
      JSON.stringify({
        workerId,
        claimedCount: claimed.length,
        runs: claimed.map(({ source, run }) => ({
          id: run.id,
          taskId: run.taskId,
          source,
          attempt: run.attempt,
          scheduledFor: run.scheduledFor.toISOString(),
          leaseExpiresAt: run.leaseExpiresAt?.toISOString() ?? null,
        })),
      }),
    );
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(
    `Scheduler claim failed: ${error instanceof Error ? error.name : "UnknownError"}`,
  );
  process.exitCode = 1;
});
