import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

export type MigrationRow = Record<string, unknown>;

export type MigrationSession = {
  execute(sql: string, parameters?: readonly unknown[]): Promise<MigrationRow[]>;
};

export type MigrationDatabase = MigrationSession & {
  transaction<T>(callback: (tx: MigrationSession) => Promise<T>): Promise<T>;
};

export type Migration = {
  id: string;
  checksum: string;
  up: string;
  down: string | null;
};

const HISTORY_SCHEMA = "app_internal";
const HISTORY_TABLE = `${HISTORY_SCHEMA}.schema_migrations`;
const STATEMENT_BREAKPOINT = "--> statement-breakpoint";

function checksum(contents: string): string {
  return createHash("sha256").update(contents).digest("hex");
}

function splitStatements(contents: string): string[] {
  return contents
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function executeMigration(
  session: MigrationSession,
  contents: string,
): Promise<void> {
  for (const statement of splitStatements(contents)) {
    await session.execute(statement);
  }
}

async function ensureHistory(database: MigrationDatabase): Promise<void> {
  await database.execute(`CREATE SCHEMA IF NOT EXISTS ${HISTORY_SCHEMA}`);
  await database.execute(`
    CREATE TABLE IF NOT EXISTS ${HISTORY_TABLE} (
      id text PRIMARY KEY,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

export async function loadMigrations(
  directory = path.resolve(process.cwd(), "drizzle"),
): Promise<Migration[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const filenames = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));

  return Promise.all(
    filenames.map(async (filename) => {
      const up = await readFile(path.join(directory, filename), "utf8");
      const rollbackPath = path.join(directory, "rollback", filename);
      let down: string | null = null;

      try {
        down = await readFile(rollbackPath, "utf8");
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "ENOENT") throw error;
      }

      return {
        id: filename,
        checksum: checksum(up),
        up,
        down,
      };
    }),
  );
}

export async function migrateDatabase(
  database: MigrationDatabase,
  migrations: readonly Migration[],
): Promise<string[]> {
  await ensureHistory(database);
  const appliedNow: string[] = [];

  for (const migration of migrations) {
    const wasApplied = await database.transaction(async (tx) => {
      await tx.execute(`LOCK TABLE ${HISTORY_TABLE} IN EXCLUSIVE MODE`);
      const rows = await tx.execute(
        `SELECT checksum FROM ${HISTORY_TABLE} WHERE id = $1`,
        [migration.id],
      );

      if (rows.length > 0) {
        if (rows[0].checksum !== migration.checksum) {
          throw new Error(
            `Migration ${migration.id} changed after it was applied.`,
          );
        }
        return false;
      }

      await executeMigration(tx, migration.up);
      await tx.execute(
        `INSERT INTO ${HISTORY_TABLE} (id, checksum) VALUES ($1, $2)`,
        [migration.id, migration.checksum],
      );
      return true;
    });

    if (wasApplied) appliedNow.push(migration.id);
  }

  return appliedNow;
}

export async function rollbackDatabase(
  database: MigrationDatabase,
  migrations: readonly Migration[],
): Promise<string | null> {
  await ensureHistory(database);

  return database.transaction(async (tx) => {
    await tx.execute(`LOCK TABLE ${HISTORY_TABLE} IN EXCLUSIVE MODE`);
    const rows = await tx.execute(
      `SELECT id FROM ${HISTORY_TABLE} ORDER BY applied_at DESC, id DESC LIMIT 1`,
    );
    const id = rows[0]?.id;
    if (typeof id !== "string") return null;

    const migration = migrations.find((candidate) => candidate.id === id);
    if (!migration) {
      throw new Error(`Applied migration ${id} is missing from the repository.`);
    }
    if (!migration.down) {
      throw new Error(`Migration ${id} has no rollback SQL.`);
    }

    await executeMigration(tx, migration.down);
    await tx.execute(`DELETE FROM ${HISTORY_TABLE} WHERE id = $1`, [id]);
    return id;
  });
}
