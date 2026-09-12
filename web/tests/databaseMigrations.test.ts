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

      expect(migrations).toHaveLength(7);
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
        "notification_deliveries",
        "notification_preferences",
        "push_subscriptions",
        "push_vapid_configurations",
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

      const preferenceResult = await pglite.query<{
        push_enabled: boolean;
        quiet_hours_enabled: boolean;
        quiet_start: string;
        quiet_end: string;
      }>(
        `INSERT INTO notification_preferences (user_id)
         VALUES ($1)
         RETURNING push_enabled, quiet_hours_enabled, quiet_start, quiet_end`,
        [userResult.rows[0].id],
      );
      expect(preferenceResult.rows[0]).toEqual({
        push_enabled: false,
        quiet_hours_enabled: true,
        quiet_start: "22:00",
        quiet_end: "08:00",
      });

      await pglite.query(
        `INSERT INTO model_credentials (
           user_id, provider, base_url, model, encrypted_api_key, api_key_hint
         ) VALUES ($1, 'deepseek', 'https://api.deepseek.com', 'deepseek-chat', 'encrypted', '••••test')`,
        [userResult.rows[0].id],
      );
      await expect(
        pglite.query(
          `INSERT INTO model_credentials (
             user_id, provider, base_url, model, encrypted_api_key, api_key_hint
           ) VALUES ($1, 'another-provider', 'https://example.com', 'model', 'encrypted', '••••test')`,
          [userResult.rows[0].id],
        ),
      ).rejects.toThrow();

      const inboxResult = await pglite.query<{ id: string }>(
        `SELECT id FROM inbox_items LIMIT 1`,
      );
      const subscriptionResult = await pglite.query<{ id: string }>(
        `INSERT INTO push_subscriptions (
           user_id, endpoint_hash, encrypted_subscription, device_label
         ) VALUES ($1, 'hash', 'encrypted', 'Migration browser')
         RETURNING id`,
        [userResult.rows[0].id],
      );
      await pglite.query(
        `INSERT INTO notification_deliveries (
           user_id, inbox_item_id, subscription_id
         ) VALUES ($1, $2, $3)`,
        [
          userResult.rows[0].id,
          inboxResult.rows[0].id,
          subscriptionResult.rows[0].id,
        ],
      );
      await expect(
        pglite.query(
          `INSERT INTO notification_deliveries (
             user_id, inbox_item_id, subscription_id
           ) VALUES ($1, $2, $3)`,
          [
            userResult.rows[0].id,
            inboxResult.rows[0].id,
            subscriptionResult.rows[0].id,
          ],
        ),
      ).rejects.toThrow();

      await expect(migrateDatabase(database, migrations)).resolves.toEqual([]);
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[6].id,
      );

      await pglite.query(
        `INSERT INTO model_credentials (
           user_id, provider, base_url, model, encrypted_api_key, api_key_hint
         ) VALUES ($1, 'another-provider', 'https://example.com', 'model', 'encrypted', '••••test')`,
        [userResult.rows[0].id],
      );
      await pglite.query(
        `DELETE FROM model_credentials
         WHERE user_id = $1 AND provider = 'another-provider'`,
        [userResult.rows[0].id],
      );
      await expect(rollbackDatabase(database, migrations)).resolves.toBe(
        migrations[5].id,
      );

      const tablesAfterRollback = await pglite.query<{ tablename: string }>(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
            'notification_deliveries',
            'notification_preferences',
            'push_subscriptions',
            'push_vapid_configurations'
          )
      `);
      expect(tablesAfterRollback.rows).toEqual([]);
      const inboxColumnsAfterRollback = await pglite.query<{ column_name: string }>(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'inbox_items'
          AND column_name = 'push_planned_at'
      `);
      expect(inboxColumnsAfterRollback.rows).toEqual([]);

      await expect(migrateDatabase(database, migrations)).resolves.toEqual([
        migrations[5].id,
        migrations[6].id,
      ]);
    },
    15_000,
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

  it("keeps the most recently updated credential when upgrading old provider rows", async () => {
    const migrations = await loadMigrations();
    await migrateDatabase(database, migrations.slice(0, 6));
    const user = await pglite.query<{ id: string }>(
      `INSERT INTO users DEFAULT VALUES RETURNING id`,
    );
    await pglite.query(
      `INSERT INTO model_credentials (
         user_id, provider, base_url, model, encrypted_api_key, api_key_hint, updated_at
       ) VALUES
         ($1, 'old-provider', 'https://old.example', 'old', 'old-encrypted', '••••old', '2026-01-01T00:00:00Z'),
         ($1, 'new-provider', 'https://new.example', 'new', 'new-encrypted', '••••new', '2026-02-01T00:00:00Z')`,
      [user.rows[0].id],
    );

    await expect(migrateDatabase(database, migrations)).resolves.toEqual([
      migrations[6].id,
    ]);
    const rows = await pglite.query<{ provider: string; model: string }>(
      `SELECT provider, model FROM model_credentials WHERE user_id = $1`,
      [user.rows[0].id],
    );
    expect(rows.rows).toEqual([{ provider: "new-provider", model: "new" }]);
  });
});
