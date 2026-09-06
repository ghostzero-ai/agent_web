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

  it("creates, validates and re-applies the current PostgreSQL schema", async () => {
    const migrations = await loadMigrations();

    expect(migrations).toHaveLength(2);
    expect(migrations.every((migration) => migration.down !== null)).toBe(true);
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
      "messages",
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

    await expect(migrateDatabase(database, migrations)).resolves.toEqual([]);
    await expect(rollbackDatabase(database, migrations)).resolves.toBe(
      migrations[1].id,
    );

    const tablesAfterRollback = await pglite.query<{ tablename: string }>(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename = 'conversation_imports'
    `);
    expect(tablesAfterRollback.rows).toEqual([]);

    await expect(migrateDatabase(database, migrations)).resolves.toEqual([
      migrations[1].id,
    ]);
  });

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
