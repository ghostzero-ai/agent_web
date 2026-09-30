import { describe, expect, it, vi } from "vitest";
import {
  createGameTurnService,
  gamePromptMessages,
  gameTurnPath,
} from "@/lib/game/gameTurnService";
import type { GameSessionDetail, GameSessionRepositoryPort } from "@/lib/repositories/gameSessionRepository";

const sessionId = "11111111-1111-4111-8111-111111111111";
const rootId = "22222222-2222-4222-8222-222222222222";
const leftId = "33333333-3333-4333-8333-333333333333";
const rightId = "44444444-4444-4444-8444-444444444444";
const createdAt = new Date("2026-09-30T03:00:00.000Z");
const baseState = {
  scene: "雾港：雨夜",
  objectives: [] as string[],
  flags: {},
  resources: {},
  inventory: {},
};

const detail: GameSessionDetail = {
  id: sessionId,
  userId: "00000000-0000-4000-8000-000000000001",
  title: "雾港来信",
  kind: "roleplay",
  status: "active",
  worldName: "雾港",
  worldPremise: "一座只在雨夜出现的港口。",
  worldTone: "悬疑、克制",
  worldRules: ["线索不会凭空消失"],
  safetyBoundaries: ["不出现血腥细节"],
  activeLeafTurnId: rightId,
  version: 5,
  createdAt,
  updatedAt: createdAt,
  characters: [{
    id: "55555555-5555-4555-8555-555555555555",
    sessionId,
    name: "林舟",
    role: "调查员",
    controller: "user",
    description: "收到一封旧信。",
    personality: "谨慎",
    goals: ["查明寄信人"],
    boundaries: [],
    version: 1,
    createdAt,
    updatedAt: createdAt,
  }],
  events: [],
  turns: [
    { id: rootId, sessionId, parentTurnId: null, playerContent: "进城", assistantContent: "雾门开启", model: "m", statePatch: {}, stateSnapshot: baseState, createdAt },
    { id: leftId, sessionId, parentTurnId: rootId, playerContent: "去码头", assistantContent: "船笛响起", model: "m", statePatch: { scene: "码头" }, stateSnapshot: { ...baseState, scene: "码头" }, createdAt },
    { id: rightId, sessionId, parentTurnId: rootId, playerContent: "去酒馆", assistantContent: "门铃轻响", model: "m", statePatch: { scene: "酒馆" }, stateSnapshot: { ...baseState, scene: "酒馆", inventory: { 旧信: 1 } }, createdAt },
  ],
};

function repository(overrides: Partial<GameSessionRepositoryPort> = {}): GameSessionRepositoryPort {
  return {
    list: vi.fn(), create: vi.fn(), get: vi.fn().mockResolvedValue(detail),
    update: vi.fn(), delete: vi.fn(), createCharacter: vi.fn(),
    updateCharacter: vi.fn(), deleteCharacter: vi.fn(), updateStatus: vi.fn(),
    appendTurn: vi.fn().mockResolvedValue({ ...detail, version: 6 }),
    ...overrides,
  };
}

describe("GameTurnService", () => {
  it("selects only the ancestors of the chosen branch", () => {
    expect(gameTurnPath(detail.turns, rightId).map((turn) => turn.id)).toEqual([
      rootId,
      rightId,
    ]);
    const messages = gamePromptMessages(detail, rightId, "询问老板");
    const content = messages.map((item) => item.content).join("\n");
    expect(content).toContain("进城");
    expect(content).toContain("去酒馆");
    expect(content).not.toContain("去码头");
    expect(content).toContain("不出现血腥细节");
  });

  it("generates and appends a turn with an optimistic version", async () => {
    const appendTurn = vi.fn().mockResolvedValue({ ...detail, version: 6 });
    const generate = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        narrative: "老板停下擦杯子的动作。",
        statePatch: { adjustInventory: { 线索纸条: 1 } },
      }),
      model: "deepseek-test",
    });
    const service = createGameTurnService(
      repository({ appendTurn }),
      { generate },
      () => createdAt,
      () => "fixed-seed",
    );
    await service.create(sessionId, {
      content: "询问老板",
      parentTurnId: rightId,
      expectedVersion: 5,
      diceRequests: [{ count: 1, sides: 20, modifier: 2, purpose: "说服检定" }],
    });
    expect(generate).toHaveBeenCalledOnce();
    expect(appendTurn).toHaveBeenCalledWith(sessionId, {
      parentTurnId: rightId,
      playerContent: "询问老板",
      assistantContent: "老板停下擦杯子的动作。",
      model: "deepseek-test",
      statePatch: { adjustInventory: { 线索纸条: 1 } },
      stateSnapshot: { ...baseState, scene: "酒馆", inventory: { 旧信: 1, 线索纸条: 1 } },
      diceRolls: [expect.objectContaining({
        notation: "1d20+2",
        seed: "fixed-seed",
        purpose: "说服检定",
      })],
      expectedVersion: 5,
      now: createdAt,
    });
  });

  it("rejects paused or stale sessions before spending a model request", async () => {
    const generate = vi.fn();
    const paused = { ...detail, status: "paused" as const };
    const service = createGameTurnService(repository({
      get: vi.fn().mockResolvedValue(paused),
    }), { generate });
    await expect(service.create(sessionId, {
      content: "继续",
      parentTurnId: rightId,
      expectedVersion: 5,
      diceRequests: [],
    })).rejects.toMatchObject({ code: "GAME_SESSION_INVALID_STATUS" });
    expect(generate).not.toHaveBeenCalled();
  });

  it("rejects an invalid model patch without persisting a partial turn", async () => {
    const appendTurn = vi.fn();
    const service = createGameTurnService(repository({ appendTurn }), {
      generate: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          narrative: "你失去了并不存在的钥匙。",
          statePatch: { adjustInventory: { 钥匙: -1 } },
        }),
        model: "deepseek-test",
      }),
    });
    await expect(service.create(sessionId, {
      content: "使用钥匙",
      parentTurnId: rightId,
      expectedVersion: 5,
      diceRequests: [],
    })).rejects.toMatchObject({ code: "GAME_STATE_INVALID" });
    expect(appendTurn).not.toHaveBeenCalled();
  });

  it("keeps recent branch context when old turns exceed the prompt budget", () => {
    const longTurns = Array.from({ length: 4 }, (_, index) => ({
      id: `${index + 6}6666666-6666-4666-8666-666666666666`,
      sessionId,
      parentTurnId: index === 0
        ? null
        : `${index + 5}6666666-6666-4666-8666-666666666666`,
      playerContent: `玩家${index}-${"甲".repeat(8_000)}`,
      assistantContent: `叙事${index}-${"乙".repeat(8_000)}`,
      model: "m",
      statePatch: {},
      stateSnapshot: baseState,
      createdAt,
    }));
    const messages = gamePromptMessages(
      { ...detail, turns: longTurns, activeLeafTurnId: longTurns[3].id },
      longTurns[3].id,
      "继续",
    );
    const joined = messages.map((item) => item.content).join("\n");
    expect(joined).toContain("玩家3-");
    expect(joined).not.toContain("玩家0-");
  });
});
