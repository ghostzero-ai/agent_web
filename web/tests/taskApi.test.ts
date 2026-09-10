import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskApi } from "@/lib/api/taskApi";
import {
  loadMigrations,
  migrateDatabase,
  type MigrationDatabase,
  type MigrationRow,
  type MigrationSession,
} from "@/lib/db/migrations";
import * as schema from "@/lib/db/schema";
import { createTaskRepository } from "@/lib/repositories/taskRepository";

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

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/v1/tasks", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Task API", () => {
  let pglite: PGlite;
  let api: ReturnType<typeof createTaskApi>;
  const now = new Date("2026-09-10T01:30:00.000Z");

  beforeEach(async () => {
    pglite = new PGlite();
    await migrateDatabase(migrationDatabase(pglite), await loadMigrations());
    api = createTaskApi(
      createTaskRepository(drizzle(pglite, { schema })),
      () => now,
    );
  });

  afterEach(async () => {
    await pglite.close();
  });

  it("creates, lists, reads, updates and deletes a reminder", async () => {
    const createdResponse = await api.create(
      jsonRequest("POST", {
        title: "晚间复习",
        prompt: "复习今日错题",
        schedule: { type: "daily", time: "20:00" },
      }),
    );
    const created = (await createdResponse.json()).data;
    expect(createdResponse.status).toBe(201);
    expect(createdResponse.headers.get("location")).toBe(
      `/api/v1/tasks/${created.id}`,
    );
    expect(created).toMatchObject({
      title: "晚间复习",
      scheduleType: "daily",
      scheduleValue: { time: "20:00" },
      nextRunAt: "2026-09-10T12:00:00.000Z",
      status: "active",
      version: 1,
    });

    expect((await (await api.list()).json()).data).toHaveLength(1);
    expect((await (await api.get(created.id)).json()).data.id).toBe(created.id);

    const pausedResponse = await api.update(
      created.id,
      jsonRequest("PATCH", {
        title: "晚间复习（暂停）",
        prompt: null,
        schedule: { type: "daily", time: "20:00" },
        status: "paused",
        expectedVersion: created.version,
      }),
    );
    const paused = (await pausedResponse.json()).data;
    expect(paused).toMatchObject({
      title: "晚间复习（暂停）",
      status: "paused",
      nextRunAt: null,
      version: 2,
    });

    const staleResponse = await api.update(
      created.id,
      jsonRequest("PATCH", {
        title: "过期修改",
        prompt: null,
        schedule: { type: "daily", time: "20:00" },
        status: "active",
        expectedVersion: created.version,
      }),
    );
    expect(staleResponse.status).toBe(409);
    expect((await staleResponse.json()).error.code).toBe("VERSION_CONFLICT");

    expect((await api.delete(created.id)).status).toBe(204);
    expect((await api.get(created.id)).status).toBe(404);
  });

  it("rejects malformed and past schedules with the stable error shape", async () => {
    const malformed = await api.create(
      jsonRequest("POST", {
        title: "错误时间",
        prompt: null,
        schedule: { type: "daily", time: "25:00" },
      }),
    );
    const past = await api.create(
      jsonRequest("POST", {
        title: "过去提醒",
        prompt: null,
        schedule: { type: "once", runAt: "2026-09-09T10:00:00+08:00" },
      }),
    );
    const invalidId = await api.get("not-a-uuid");

    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error).toMatchObject({
      code: "INVALID_REQUEST",
      retryable: false,
    });
    expect(past.status).toBe(400);
    expect((await past.json()).error.message).toContain("future");
    expect(invalidId.status).toBe(400);
  });

  it("does not expose an internal database error", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const unavailable = createTaskApi(() => {
      throw new Error("secret connection detail");
    });
    const response = await unavailable.list();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatchObject({
      code: "INTERNAL_ERROR",
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain("secret connection detail");
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
