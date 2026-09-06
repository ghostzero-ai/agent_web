import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { loadMigrations, rollbackDatabase } from "../lib/db/migrations";
import { createPostgresMigrationDatabase } from "../lib/db/postgresMigrationDatabase";

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required. Copy .env.example to .env.local.");
  }

  const client = postgres(databaseUrl, { max: 1 });

  try {
    const migrations = await loadMigrations();
    const rolledBack = await rollbackDatabase(
      createPostgresMigrationDatabase(client),
      migrations,
    );

    console.log(
      rolledBack
        ? `Rolled back migration: ${rolledBack}`
        : "Nothing to roll back.",
    );
  } finally {
    await client.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
