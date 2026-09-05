import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

type DatabaseState = {
  client?: Sql;
  database?: PostgresJsDatabase<typeof schema>;
};

const databaseState = globalThis as typeof globalThis & {
  agentWebDatabase?: DatabaseState;
};

export type AppDatabase = PostgresJsDatabase<typeof schema>;

export function getDatabase(): AppDatabase {
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for server database access.");
  }

  const state = databaseState.agentWebDatabase ?? {};
  if (!state.client) {
    state.client = postgres(databaseUrl, { max: 10 });
  }
  if (!state.database) {
    state.database = drizzle(state.client, { schema });
  }

  databaseState.agentWebDatabase = state;
  return state.database;
}
