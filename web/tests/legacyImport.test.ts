import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { createLegacyImportApi } from "@/lib/api/legacyImportApi";
import {
  loadMigrations,
  migrateDatabase,
  type MigrationDatabase,
  type MigrationRow,
  type MigrationSession,
} from "@/lib/db/migrations";
import {
  createLegacyImportRepository,
  type LegacyImportRepositoryPort,
  type LegacyImportSession,
} from "@/lib/repositories/legacyImportRepository";

function createMigrationSession(database: Pick<PGlite, "query">): MigrationSession {
  return {
    async execute(query, parameters = []) {
      const result = await database.query<MigrationRow>(query, [...parameters]);
      return result.rows;
    },
  };
}

function createMigrationDatabase(database: PGlite): MigrationDatabase {
  return {
    ...createMigrationSession(database),
    transaction(callback) {
      return database.transaction((transaction) =>
        callback(createMigrationSession(transaction)),
      );
    },
  };
}

const branchedSession: LegacyImportSession = {
  id: "legacy-session-1",
  title: "树形旧会话",
  updatedAt: 1_700_000_003_000,
  activeLeafId: "answer-b",
  messages: [
    {
      id: "question",
      parentId: null,
      role: "user",
      content: "什么是事务？",
      createdAt: 1_700_000_000_000,
    },
    {
      id: "answer-a",
      parentId: "question",
      role: "assistant",
      content: "回答 A",
      createdAt: 1_700_000_001_000,
    },
    {
      id: "answer-b",
      parentId: "question",
      role: "assistant",
      content: "回答 B",
      createdAt: 1_700_000_002_000,
    },
  ],
};

describe("legacy localStorage import", () => {
  let pglite: PGlite;
  let repository: LegacyImportRepositoryPort;

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(
      createMigrationDatabase(pglite),
      await loadMigrations(),
    );
    repository = createLegacyImportRepository(drizzle(pglite, { schema }));
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("preserves the tree and active branch while remapping legacy ids", async () => {
    const result = await repository.importSessions([branchedSession]);
    expect(result).toMatchObject({ imported: 1, alreadyImported: 0 });

    const conversation = await pglite.query<{
      id: string;
      active_leaf_message_id: string;
      title: string;
    }>("SELECT id, active_leaf_message_id, title FROM conversations");
    const importedMessages = await pglite.query<{
      id: string;
      parent_message_id: string | null;
      content: string;
    }>("SELECT id, parent_message_id, content FROM messages ORDER BY created_at");

    expect(conversation.rows[0].title).toBe("树形旧会话");
    expect(importedMessages.rows).toHaveLength(3);
    const question = importedMessages.rows.find((message) => message.content === "什么是事务？")!;
    const answerA = importedMessages.rows.find((message) => message.content === "回答 A")!;
    const answerB = importedMessages.rows.find((message) => message.content === "回答 B")!;
    expect(answerA.parent_message_id).toBe(question.id);
    expect(answerB.parent_message_id).toBe(question.id);
    expect(conversation.rows[0].active_leaf_message_id).toBe(answerB.id);
  });

  it("uses the import receipt to make repeated imports idempotent", async () => {
    await repository.importSessions([branchedSession]);
    const repeated = await repository.importSessions([branchedSession]);
    const preview = await repository.preview([branchedSession]);

    expect(repeated).toMatchObject({ imported: 0, alreadyImported: 1 });
    expect(preview).toMatchObject({ importable: 0, alreadyImported: 1 });
    const conversations = await pglite.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM conversations",
    );
    expect(conversations.rows[0].count).toBe(1);
  });

  it("supports preview without writing a conversation", async () => {
    const preview = await repository.preview([branchedSession]);
    expect(preview).toMatchObject({ total: 1, importable: 1, alreadyImported: 0 });
    const conversations = await pglite.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM conversations",
    );
    expect(conversations.rows[0].count).toBe(0);
  });

  it("rejects missing parents and cycles before calling the repository", async () => {
    const api = createLegacyImportApi(repository);
    const invalid = {
      ...branchedSession,
      messages: [
        {
          ...branchedSession.messages[0],
          parentId: "missing-parent",
        },
      ],
      activeLeafId: "question",
    };
    const response = await api.execute(
      new Request("http://localhost/api/v1/imports/local-storage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import", sessions: [invalid] }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "INVALID_IMPORT", retryable: false },
    });
    const conversations = await pglite.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM conversations",
    );
    expect(conversations.rows[0].count).toBe(0);
  });

  it("rejects privileged roles and unknown fields", async () => {
    const api = createLegacyImportApi(repository);
    const unsafe = {
      ...branchedSession,
      messages: [
        { ...branchedSession.messages[0], role: "system", injected: true },
      ],
    };
    const response = await api.execute(
      new Request("http://localhost/api/v1/imports/local-storage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "import", sessions: [unsafe] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(response.headers.get("x-request-id")).toBeTruthy();
  });
});
