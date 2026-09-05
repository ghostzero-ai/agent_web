import type { Sql, TransactionSql } from "postgres";
import type {
  MigrationDatabase,
  MigrationRow,
  MigrationSession,
} from "./migrations";

type PostgresExecutor = Sql | TransactionSql;

function createSession(executor: PostgresExecutor): MigrationSession {
  return {
    async execute(query, parameters = []) {
      const rows = await executor.unsafe<MigrationRow[]>(
        query,
        [...parameters] as never[],
      );
      return Array.from(rows) as MigrationRow[];
    },
  };
}

export function createPostgresMigrationDatabase(
  client: Sql,
): MigrationDatabase {
  const session = createSession(client);

  return {
    ...session,
    async transaction<T>(callback: (tx: MigrationSession) => Promise<T>) {
      return (await client.begin((transaction) =>
        callback(createSession(transaction)),
      )) as T;
    },
  };
}
