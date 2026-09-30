import { describe, expect, it } from "vitest";
import { exportGameSessionArtifact } from "@/lib/game/gameSessionExport";
import type { GameSessionDetail } from "@/lib/repositories/gameSessionRepository";

const now = new Date("2026-09-30T08:00:00.000Z");
const state = { scene: "雾港", objectives: [], flags: {}, resources: {}, inventory: {} };
const session: GameSessionDetail = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "00000000-0000-4000-8000-000000000001",
  title: "雾港：第一夜",
  kind: "roleplay",
  status: "paused",
  worldName: "雾港",
  worldPremise: "雨夜港口",
  worldTone: "克制",
  worldRules: [],
  safetyBoundaries: [],
  activeLeafTurnId: "33333333-3333-4333-8333-333333333333",
  version: 4,
  createdAt: now,
  updatedAt: now,
  characters: [],
  events: [],
  turns: [
    { id: "22222222-2222-4222-8222-222222222222", sessionId: "11111111-1111-4111-8111-111111111111", parentTurnId: null, playerContent: "进城", assistantContent: "雾门开启", model: "m", statePatch: {}, stateSnapshot: state, createdAt: now },
    { id: "33333333-3333-4333-8333-333333333333", sessionId: "11111111-1111-4111-8111-111111111111", parentTurnId: "22222222-2222-4222-8222-222222222222", playerContent: "去酒馆", assistantContent: "门铃轻响", model: "m", statePatch: {}, stateSnapshot: state, createdAt: now },
  ],
};

describe("GameSession export", () => {
  it("exports the complete branch tree as portable JSON", () => {
    const artifact = exportGameSessionArtifact(session, "json", now);
    expect(artifact.filename).toBe("雾港-第一夜-2026-09-30.json");
    const exported = JSON.parse(artifact.content);
    expect(exported).toMatchObject({
      schemaVersion: 2,
      session: { title: "雾港：第一夜" },
    });
    expect(exported.session.turns).toHaveLength(2);
    expect(exported.session.turns[0]).toMatchObject({ playerContent: "进城" });
  });

  it("labels active-path turns in Markdown", () => {
    const artifact = exportGameSessionArtifact(session, "markdown", now);
    expect(artifact.content).toContain("回合 1 · 当前剧情线");
    expect(artifact.content).toContain("### AI\n\n门铃轻响");
    expect(artifact.content).toContain("这是独立 GameSession 的虚构记录");
    expect(artifact.content).toContain("### 状态补丁");
    expect(artifact.content).toContain("### 回合后状态快照");
  });
});
