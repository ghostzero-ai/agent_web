import type { GameSessionExportFormat } from "@/lib/game/contracts";
import { gameTurnPath } from "@/lib/game/gameTurnService";
import type { GameSessionDetail } from "@/lib/repositories/gameSessionRepository";
import type { PromptExportArtifact } from "@/lib/platform/capabilities";

function safeFilename(value: string): string {
  const cleaned = value.trim().replace(/[\\/:：*?"<>|]+/gu, "-").slice(0, 60);
  return cleaned || "game-session";
}

function markdown(session: GameSessionDetail, exportedAt: Date): string {
  const activeIds = new Set(
    gameTurnPath(session.turns, session.activeLeafTurnId).map((turn) => turn.id),
  );
  const sections = session.turns.map((turn, index) => [
    `## 回合 ${index + 1}${activeIds.has(turn.id) ? " · 当前剧情线" : " · 历史分支"}`,
    "",
    `- 回合 ID：\`${turn.id}\``,
    `- 父回合：${turn.parentTurnId ? `\`${turn.parentTurnId}\`` : "根节点"}`,
    `- 模型：${turn.model}`,
    `- 时间：${turn.createdAt.toISOString()}`,
    "",
    "### 玩家",
    "",
    turn.playerContent,
    "",
    "### AI",
    "",
    turn.assistantContent,
  ].join("\n"));

  return [
    `# ${session.title}`,
    "",
    "> 这是独立 GameSession 的虚构记录，不代表现实事实。",
    "",
    `- 类型：${session.kind}`,
    `- 状态：${session.status}`,
    `- 世界：${session.worldName}`,
    `- 导出时间：${exportedAt.toISOString()}`,
    "",
    "## 世界前提",
    "",
    session.worldPremise,
    "",
    ...sections,
  ].join("\n");
}

export function exportGameSessionArtifact(
  session: GameSessionDetail,
  format: GameSessionExportFormat,
  exportedAt = new Date(),
): PromptExportArtifact {
  const base = `${safeFilename(session.title)}-${exportedAt.toISOString().slice(0, 10)}`;
  if (format === "json") {
    return {
      filename: `${base}.json`,
      mediaType: "application/json",
      content: JSON.stringify({ schemaVersion: 1, exportedAt, session }, null, 2),
      directory: "game-exports",
      shareTitle: "分享游戏记录",
      shareText: "独立 GameSession 的虚构世界、角色卡与完整分支记录。",
      dialogTitle: "分享游戏 JSON",
    };
  }
  return {
    filename: `${base}.md`,
    mediaType: "text/markdown",
    content: markdown(session, exportedAt),
    directory: "game-exports",
    shareTitle: "分享游戏记录",
    shareText: "独立 GameSession 的虚构剧情记录。",
    dialogTitle: "分享游戏 Markdown",
  };
}
