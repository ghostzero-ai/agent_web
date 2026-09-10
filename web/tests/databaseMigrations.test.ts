import { PGlite } from "@electric-sql/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  loadMigrations,
  migrateDatabase,
  rollbackDatabase,
  type MigrationDatabase,
  type MigrationRow,
  type MigrationSession,
} from "@/lib/db/migrations";

function createSession(
  database: Pick<PGlite, "query">,
): MigrationSession {
  return {
    async execute(query, parameters = []) {
      const result = await database.query<MigrationRow>(query, [...parameters]);
      return result.rows;
    },
  };
}

function createMigrationDatabase(database: PGlite): MigrationDatabase {
  return {
    ...createSession(database),
    transaction(callback) {
      return database.transaction((transaction) =>
        callback(createSession(transaction)),
      );
    },
  };
}

describe("database migrations", () => {
  let pglite: PGlite;
  let database: MigrationDatabase;

  beforeEach(() => {
    pglite = new PGlite();
    database = createMigrationDatabase(pglite);
  });

  afterEach(async () => {
    await pglite.close();
  });

  it(
    "creates, validates and re-applies the current PostgreSQL schema",
    async () => {
      const migrations = await loadMigrations();

      expect(migrations).toHaveLength(5);
      expect(migrations.every((migration) => migration.down !== null)).toBe(
        true,
      );
      await expect(migrateDatabase(database, migrations)).resolves.toEqual(
        migrations.map((migration) => migration.id),
      );

      const tableResult = await pglite.query<{ tablename: string }>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY tablename
      `);
      expect(tableResult.rows.map((row) => row.tablename)).toEqual([
      "conversation_imports",
      "conversations",
      "inbox_items",
      "messages",
      "model_credentials",
      "scheduled_tasks",
      "task_runs",
      "users",
      ]);

      const userResult = await pglite.query<{ id: string }>(`
        INSERT INTO users DEFAULT VALUES RETURNING id
      `);
      const conversationResult = await pglite.query<{ id: string }>(
        `INSERT INTO conversations (user_id, title)
         VALUES ($1, 'Migration test')
         RETURNING id`,
        [userResult.rows[0].id],
      );
      const messageResult = await pglite.query<{
        citations: unknown[];
        status: string;
      }>(
        `INSERT INTO messages (conversation_id, role, content)
         VALUES ($1, 'user', 'Hello')
         RETURNING citations, status`,
        [conversationResult.rows[0].id],
      );
      expect(messageResult.rows[0]).toMatchObject({
        citations: [],
        status: "complete",
      });

      const taskResult = await pglite.query<{ id: string }>(
        `INSERT INTO scheduled_tasks (
           user_id, title, schedule_type, schedule_value, next_run_at
         ) VALUES ($1, 'Daily review', 'daily', '{"time":"09:00"}', '2030-01-01T01:00:00Z')
         RETURNING id`,
        [userResult.rows[0].id],
      );
      const runResult = await pglite.query<{ id: string }>(
        `INSERT INTO task_runs (task_id, scheduled_for)
         VALUES ($1, '2030-01-01T01:00:00Z')
         RETURNING id`,
        [taskResult.rows[0].id],
      );
      await expect(
        pglite.query(
          `INSERT INTO task_runs (task_id, scheduled_for)
           VALUES ($1, '2030-01-01T01:00:00Z')`,
          [taskResult.rows[0].id],
        ),
      ).rejects.toThrow();

      await pglite.query(
        `INSERT INTO inbox_items (
           user_id, task_id, task_run_id, title, occurred_at
         ) VALUES ($1, $2, $3, 'Durable reminder', '2030-01-01T01:00:00Z')`,
        [userResult.rows[0].id, taskResult.rows[0].id, runResult.rows[0].id],
      );
      await pglite.query(`DELETE FROM scheduled_tasks WHERE id = $1`, [
        taskResult.rows[0].id,
      ]);
      const durableInbox = await pglite.query<{
        task_id: string | null;
        task_run_id: string | null;
      }>(`SELECT task_id, task_run_id FROM inbox_items`);
      expect(durableInbox.rows[0]).toEqual({
        task_id: null,
        task_run_id: null,
      });

      await expect(migrateDatabase(database, migrations)).resolves.toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[4].id,
      );

      const tablesAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename = 'inbox_items'
      `);
      expect(tablesAfterRollback.rows).toEqual([]);

      await expect(migrateDatabase(database, migrations)).resolves.toEqual([
        migrations[4].id,
      ]);
    },
    10_000,
  );

  it("rejects drift in a migration that has already been applied", async () => {
    const migrations = await loadMigrations();
    await migrateDatabase(database, migrations);

    await expect(
      migrateDatabase(database, [
        { ...migrations[0], checksum: "changed-after-apply" },
      ]),
    ).rejects.toThrow("changed after it was applied");
  });
});
