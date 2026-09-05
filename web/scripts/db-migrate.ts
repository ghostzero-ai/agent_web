import { loadEnvConfig } from "@next/env";
import postgres from "postgres";
import { loadMigrations, migrateDatabase } from "../lib/db/migrations";
import { createPostgresMigrationDatabase } from "../lib/db/postgresMigrationDatabase";

loadEnvConfig(process.cwd());

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env.local.");
}

const client = postgres(databaseUrl, { max: 1 });

try {
  const migrations = await loadMigrations();
  const applied = await migrateDatabase(
    createPostgresMigrationDatabase(client),
    migrations,
  );

  console.log(
    applied.length > 0
      ? `Applied migrations: ${applied.join(", ")}`
      : "Database is already up to date.",
  );
} finally {
  await client.end();
}
