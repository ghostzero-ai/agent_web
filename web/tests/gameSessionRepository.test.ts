import { count } from "drizzle-orm";
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
import { createGameSessionRepository } from "@/lib/repositories/gameSessionRepository";

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

const world = {
  name: "雾港",
  premise: "一座只在雨夜出现的港口。",
  tone: "悬疑、克制",
  rules: ["线索不会凭空消失"],
  boundaries: ["不把虚构当作现实"],
};

const character = {
  name: "林舟",
  role: "调查员",
  controller: "user" as const,
  description: "收到一封旧信。",
  personality: "谨慎但好奇",
  goals: ["查明寄信人"],
  boundaries: ["不出现血腥细节"],
};

describe("GameSessionRepository", () => {
  let pglite: PGlite;
  let repository: ReturnType<typeof createGameSessionRepository>;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(migrationDatabase(pglite), await loadMigrations());
    repository = createGameSessionRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("persists world and character state outside conversations and memories", async () => {
    const now = new Date("2026-09-30T03:00:00.000Z");
    const created = await repository.create({
      title: "雾港来信",
      kind: "roleplay",
      world,
      initialCharacter: character,
      now,
    });

    expect(created).toMatchObject({
      title: "雾港来信",
      worldName: "雾港",
      status: "setup",
      version: 1,
    });
    expect(created.characters).toHaveLength(1);
    expect(created.characters[0]).toMatchObject({ name: "林舟", version: 1 });

    const [conversationCount] = await drizzle(pglite, { schema })
      .select({ value: count() })
      .from(schema.conversations);
    const [memoryCount] = await drizzle(pglite, { schema })
      .select({ value: count() })
      .from(schema.memoryItems);
    expect(conversationCount.value).toBe(0);
    expect(memoryCount.value).toBe(0);
  });

  it("versions session and character mutations and rejects stale writes", async () => {
    const first = new Date("2026-09-30T03:00:00.000Z");
    const created = await repository.create({
      title: "雾港来信",
      kind: "roleplay",
      world,
      initialCharacter: character,
      now: first,
    });
    const updated = await repository.update(created.id, {
      title: "雾港第二夜",
      kind: "interactive-story",
      world: { ...world, tone: "更明亮" },
      expectedVersion: 1,
      now: new Date("2026-09-30T04:00:00.000Z"),
    });
    expect(updated).toMatchObject({ title: "雾港第二夜", version: 2 });

    const withCharacter = await repository.createCharacter(created.id, {
      ...character,
      name: "守灯人",
      controller: "ai",
      expectedSessionVersion: 2,
      now: new Date("2026-09-30T05:00:00.000Z"),
    });
    expect(withCharacter.version).toBe(3);
    expect(withCharacter.characters).toHaveLength(2);
    const keeper = withCharacter.characters.find((item) => item.name === "守灯人")!;

    const edited = await repository.updateCharacter(created.id, keeper.id, {
      ...character,
      name: "老守灯人",
      controller: "ai",
      expectedSessionVersion: 3,
      expectedCharacterVersion: 1,
      now: new Date("2026-09-30T06:00:00.000Z"),
    });
    expect(edited.version).toBe(4);
    expect(edited.characters.find((item) => item.id === keeper.id)).toMatchObject({
      name: "老守灯人",
      version: 2,
    });

    await expect(repository.update(created.id, {
      title: "过期写入",
      kind: "roleplay",
      world,
      expectedVersion: 1,
      now: first,
    })).rejects.toMatchObject({ code: "GAME_SESSION_VERSION_CONFLICT" });
    await expect(repository.deleteCharacter(created.id, keeper.id, {
      expectedSessionVersion: 4,
      expectedCharacterVersion: 1,
      now: first,
    })).rejects.toMatchObject({ code: "GAME_CHARACTER_VERSION_CONFLICT" });

    const afterDelete = await repository.deleteCharacter(created.id, keeper.id, {
      expectedSessionVersion: 4,
      expectedCharacterVersion: 2,
      now: new Date("2026-09-30T07:00:00.000Z"),
    });
    expect(afterDelete.version).toBe(5);
    expect(afterDelete.characters.map((item) => item.name)).toEqual(["林舟"]);
  });

  it("cascades character cards when a session is explicitly deleted", async () => {
    const now = new Date("2026-09-30T03:00:00.000Z");
    const created = await repository.create({
      title: "短篇",
      kind: "interactive-story",
      world,
      initialCharacter: character,
      now,
    });
    await repository.delete(created.id, 1);
    expect(await repository.get(created.id)).toBeNull();
    const result = await pglite.query<{ value: number }>(
      "SELECT count(*)::int AS value FROM game_characters",
    );
    expect(result.rows[0].value).toBe(0);
  });
});
