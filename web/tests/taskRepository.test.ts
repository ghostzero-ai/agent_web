import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import {
  loadMigrations,
  migrateDatabase,
  type MigrationDatabase,
  type MigrationRow,
  type MigrationSession,
} from "@/lib/db/migrations";
import {
  createTaskRepository,
  TaskRepositoryError,
  type TaskRepositoryPort,
} from "@/lib/repositories/taskRepository";

function migrationSession(database: Pick<PGlite, "query">): MigrationSession {
  return {
    async execute(query, parameters = []) {
      const result = await database.query<MigrationRow>(query, [...parameters]);
      return result.rows;
    },
  };
}

function migrationDatabase(database: PGlite): MigrationDatabase {
  return {
    ...migrationSession(database),
    transaction(callback) {
      return database.transaction((transaction) =>
        callback(migrationSession(transaction)),
      );
    },
  };
}

describe("TaskRepository", () => {
  let pglite: PGlite;
  let repository: TaskRepositoryPort;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(migrationDatabase(pglite), await loadMigrations());
    repository = createTaskRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("creates, lists, pauses and resumes a local task", async () => {
    const base = {
      title: "复习英语",
      prompt: "复习今天的单词",
      scheduleType: "daily" as const,
      scheduleValue: { time: "20:00" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2030-01-01T12:00:00Z"),
    };
    const created = await repository.create(base);
    expect(created).toMatchObject({ status: "active", version: 1, ...base });
    await expect(repository.list()).resolves.toHaveLength(1);

    const paused = await repository.update(created.id, {
      ...base,
      status: "paused",
      expectedVersion: created.version,
    });
    expect(paused).toMatchObject({ status: "paused", nextRunAt: null, version: 2 });

    const resumed = await repository.update(created.id, {
      ...base,
      status: "active",
      expectedVersion: paused.version,
    });
    expect(resumed).toMatchObject({ status: "active", version: 3 });
    expect(resumed.nextRunAt?.toISOString()).toBe("2030-01-01T12:00:00.000Z");
  });

  it("enforces optimistic versions and local-user deletion", async () => {
    const input = {
      title: "一次提醒",
      prompt: null,
      scheduleType: "once" as const,
      scheduleValue: { runAt: "2030-01-01T00:00:00.000Z" },
      timezone: "Asia/Shanghai",
      nextRunAt: new Date("2030-01-01T00:00:00Z"),
    };
    const task = await repository.create(input);
    await expect(
      repository.update(task.id, {
        ...input,
        status: "paused",
        expectedVersion: 99,
      }),
    ).rejects.toMatchObject({
      code: "VERSION_CONFLICT",
    } satisfies Partial<TaskRepositoryError>);
    await expect(repository.delete(task.id)).resolves.toBe(true);
    await expect(repository.get(task.id)).resolves.toBeNull();
    await expect(repository.delete(task.id)).resolves.toBe(false);
  });
});
