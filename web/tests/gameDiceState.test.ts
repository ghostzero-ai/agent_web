import { describe, expect, it } from "vitest";
import { rollGameDice } from "@/lib/game/dice";
import {
  applyGameStatePatch,
  parseGameModelTurn,
  type GameState,
} from "@/lib/game/state";

const state: GameState = {
  scene: "雾港酒馆",
  objectives: ["找到寄信人"],
  flags: { metKeeper: true },
  resources: { 体力: 3 },
  inventory: { 旧信: 1 },
};

describe("Phase 6.3 dice and structured state", () => {
  it("reproduces every die result from the same algorithm, seed and request", () => {
    const request = { count: 3, sides: 6 as const, modifier: 2, purpose: "潜行检定" };
    const first = rollGameDice(request, "session-1:turn-2:roll-0");
    const replay = rollGameDice(request, "session-1:turn-2:roll-0");
    expect(replay).toEqual(first);
    expect(first).toMatchObject({
      notation: "3d6+2",
      algorithm: "fnv1a-mulberry32-v1",
      seed: "session-1:turn-2:roll-0",
    });
    expect(first.results).toHaveLength(3);
    expect(first.results.every((result) => result >= 1 && result <= 6)).toBe(true);
    expect(first.total).toBe(first.results.reduce((sum, result) => sum + result, 2));
  });

  it("applies an allowed patch without mutating the parent snapshot", () => {
    const next = applyGameStatePatch(state, {
      scene: "雾港钟楼",
      setFlags: { doorUnlocked: true },
      removeFlags: ["metKeeper"],
      adjustResources: { 体力: -1 },
      adjustInventory: { 旧信: -1, 铜钥匙: 1 },
    });
    expect(next).toEqual({
      scene: "雾港钟楼",
      objectives: ["找到寄信人"],
      flags: { doorUnlocked: true },
      resources: { 体力: 2 },
      inventory: { 铜钥匙: 1 },
    });
    expect(state.inventory).toEqual({ 旧信: 1 });
  });

  it("rejects negative inventory and unauthorized model fields", () => {
    expect(() => applyGameStatePatch(state, {
      adjustInventory: { 不存在的物品: -1 },
    })).toThrow(/cannot become negative/);

    expect(() => parseGameModelTurn(JSON.stringify({
      narrative: "模型试图直接调用系统工具。",
      statePatch: {},
      toolCalls: [{ name: "delete_database" }],
    }))).toThrow(/invalid or unauthorized/);
  });

  it("accepts a fenced JSON response but still validates its strict schema", () => {
    expect(parseGameModelTurn(`\`\`\`json
{"narrative":"雨声停了一瞬。","statePatch":{"adjustResources":{"体力":-1}}}
\`\`\``)).toEqual({
      narrative: "雨声停了一瞬。",
      statePatch: { adjustResources: { 体力: -1 } },
    });
  });
});
