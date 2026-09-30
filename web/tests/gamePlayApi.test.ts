import { describe, expect, it, vi } from "vitest";
import { createGamePlayApi } from "@/lib/api/gamePlayApi";
import { GameNarrativeGenerationError } from "@/lib/game/gameNarrativeGenerator";
import type { GameSessionRepositoryPort } from "@/lib/repositories/gameSessionRepository";

function repository(overrides: Partial<GameSessionRepositoryPort> = {}): GameSessionRepositoryPort {
  return {
    list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), delete: vi.fn(),
    createCharacter: vi.fn(), updateCharacter: vi.fn(), deleteCharacter: vi.fn(),
    updateStatus: vi.fn(), appendTurn: vi.fn(), createCheckpoint: vi.fn(),
    restoreCheckpoint: vi.fn(), deleteCheckpoint: vi.fn(), ...overrides,
  };
}

function request(body: unknown): Request {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GamePlay API", () => {
  it("validates and updates pause/resume state with a version", async () => {
    const updateStatus = vi.fn().mockResolvedValue({ status: "active", version: 2 });
    const api = createGamePlayApi(
      repository({ updateStatus }),
      { create: vi.fn() },
      () => new Date("2026-09-30T08:00:00.000Z"),
    );
    const id = crypto.randomUUID();
    const response = await api.updateStatus(id, request({
      status: "active",
      expectedVersion: 1,
    }));
    expect(response.status).toBe(200);
    expect(updateStatus).toHaveBeenCalledWith(id, {
      status: "active",
      expectedVersion: 1,
      now: new Date("2026-09-30T08:00:00.000Z"),
    });
  });

  it("rejects malformed turn requests before invoking the model", async () => {
    const create = vi.fn();
    const api = createGamePlayApi(repository(), { create });
    const response = await api.createTurn(crypto.randomUUID(), request({
      content: "",
      parentTurnId: null,
      expectedVersion: 1,
    }));
    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("maps model configuration errors without exposing internals", async () => {
    const create = vi.fn().mockRejectedValue(new GameNarrativeGenerationError(
      "MODEL_CONFIGURATION_ERROR",
      "Server model provider is not configured.",
      false,
    ));
    const api = createGamePlayApi(repository(), { create });
    const response = await api.createTurn(crypto.randomUUID(), request({
      content: "进入港口",
      parentTurnId: null,
      expectedVersion: 1,
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "MODEL_CONFIGURATION_ERROR", retryable: false },
    });
  });

  it("creates, restores and deletes named checkpoints through versioned operations", async () => {
    const createCheckpoint = vi.fn().mockResolvedValue({ version: 6 });
    const restoreCheckpoint = vi.fn().mockResolvedValue({ version: 7 });
    const deleteCheckpoint = vi.fn().mockResolvedValue({ version: 8 });
    const api = createGamePlayApi(repository({
      createCheckpoint,
      restoreCheckpoint,
      deleteCheckpoint,
    }), { create: vi.fn() }, () => new Date("2026-09-30T08:00:00.000Z"));
    const id = crypto.randomUUID();
    const checkpointId = crypto.randomUUID();

    expect((await api.createCheckpoint(id, request({
      name: "进入钟楼前",
      note: "保留酒馆线索",
      expectedVersion: 5,
    }))).status).toBe(201);
    expect((await api.restoreCheckpoint(id, checkpointId, request({
      expectedVersion: 6,
    }))).status).toBe(200);
    expect((await api.deleteCheckpoint(id, checkpointId, request({
      expectedVersion: 7,
    }))).status).toBe(200);
    expect(createCheckpoint).toHaveBeenCalledWith(id, expect.objectContaining({
      name: "进入钟楼前",
      note: "保留酒馆线索",
      expectedVersion: 5,
    }));
    expect(restoreCheckpoint).toHaveBeenCalledWith(id, checkpointId, expect.objectContaining({
      expectedVersion: 6,
    }));
    expect(deleteCheckpoint).toHaveBeenCalledWith(id, checkpointId, expect.objectContaining({
      expectedVersion: 7,
    }));
  });
});
