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
import { createReflectionPreferenceRepository } from "@/lib/repositories/reflectionPreferenceRepository";

function session(database: Pick<PGlite, "query">): MigrationSession {
  return {
    async execute(query, parameters = []) {
      return (await database.query<MigrationRow>(query, [...parameters])).rows;
    },
  };
}

function migrationDatabase(database: PGlite): MigrationDatabase {
  return {
    ...session(database),
    transaction(callback) {
      return database.transaction((transaction) => callback(session(transaction)));
    },
  };
}

describe("ReflectionPreferenceRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createReflectionPreferenceRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(migrationDatabase(pglite), await loadMigrations());
    repository = createReflectionPreferenceRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => pglite.close());

  it("creates defaults and enforces optimistic locking", async () => {
    await expect(repository.get()).resolves.toMatchObject({
      enabled: true,
      goals: [],
      avoidTopics: [],
      style: "balanced",
      maxQuestions: 1,
      version: 1,
    });
    const now = new Date("2026-09-27T03:00:00.000Z");
    await expect(
      repository.update({
        enabled: true,
        goals: ["完成作品集"],
        avoidTopics: ["家庭隐私"],
        style: "gentle",
        maxQuestions: 2,
        expectedVersion: 1,
        now,
      }),
    ).resolves.toMatchObject({ version: 2, maxQuestions: 2, updatedAt: now });
    await expect(
      repository.update({
        enabled: false,
        goals: [],
        avoidTopics: [],
        style: "balanced",
        maxQuestions: 1,
        expectedVersion: 1,
        now,
      }),
    ).rejects.toMatchObject({ code: "REFLECTION_PREFERENCE_VERSION_CONFLICT" });
  });
});
