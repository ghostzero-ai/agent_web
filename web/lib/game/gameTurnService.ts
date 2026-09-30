import type { ChatCompletionMessage } from "@/lib/ai/messages";
import type { CreateGameTurnRequest } from "@/lib/game/contracts";
import { rollGameDice, type GameDiceRoll } from "@/lib/game/dice";
import {
  createGameNarrativeGenerator,
  type GameNarrativeGeneratorPort,
} from "@/lib/game/gameNarrativeGenerator";
import {
  GameSessionRepositoryError,
  type GameSessionDetail,
  type GameSessionRepositoryPort,
} from "@/lib/repositories/gameSessionRepository";
import type { GameTurnRecord } from "@/lib/db/schema";
import {
  applyGameStatePatch,
  initialGameState,
  parseGameModelTurn,
  type GameState,
} from "@/lib/game/state";

const MAX_HISTORY_TURNS = 30;
const MAX_HISTORY_CHARACTERS = 48_000;
const MAX_CHARACTER_CONTEXT_CHARACTERS = 24_000;

export function gameTurnPath(
  turns: readonly GameTurnRecord[],
  leafId: string | null,
): GameTurnRecord[] {
  if (!leafId) return [];
  const byId = new Map(turns.map((turn) => [turn.id, turn]));
  const path: GameTurnRecord[] = [];
  const visited = new Set<string>();
  let current: GameTurnRecord | undefined = byId.get(leafId);
  if (!current) {
    throw new GameSessionRepositoryError(
      "GAME_TURN_NOT_FOUND",
      "Selected game branch was not found in this session.",
    );
  }
  while (current) {
    if (visited.has(current.id)) {
      throw new Error("Game turn tree contains a cycle.");
    }
    visited.add(current.id);
    path.push(current);
    current = current.parentTurnId
      ? byId.get(current.parentTurnId)
      : undefined;
  }
  return path.reverse();
}

function listLines(items: readonly string[], empty: string): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : empty;
}

function systemPrompt(session: GameSessionDetail): string {
  const characters = session.characters.slice(0, 20).map((character) => [
    `### ${character.name}（${character.role}，控制者：${character.controller}）`,
    character.description,
    character.personality ? `性格与表达：${character.personality}` : "",
    `目标：\n${listLines(character.goals, "- 未设定")}`,
    `角色边界：\n${listLines(character.boundaries, "- 无额外边界")}`,
  ].filter(Boolean).join("\n")).join("\n\n").slice(0, MAX_CHARACTER_CONTEXT_CHARACTERS);

  return `你是一个有连续性的中文互动叙事主持人。以下内容全部属于虚构 GameSession，不是现实事实，也不得写入现实身份记忆。

玩法：${session.kind}
世界：${session.worldName}
前提：${session.worldPremise}
语调：${session.worldTone}

世界规则：
${listLines(session.worldRules, "- 遵循前提与已有剧情")}

不可突破的内容边界：
${listLines(session.safetyBoundaries, "- 无额外边界")}

角色卡：
${characters || "尚未创建角色卡。"}

规则：
- 延续所选剧情分支，只使用该分支已经发生的回合；不要混入其他分支。
- 尊重由用户控制的角色，不替用户决定关键选择、内心想法或不可逆行动。
- 可以扮演 AI 或 shared 控制的角色，并推动场景产生可回应的变化。
- 严格遵守世界规则、角色边界和内容边界。
- 骰子结果只能引用 Dice Tool 提供的可信结果；没有结果时不得自行声称掷骰或编造点数。
- 只输出一个 JSON 对象，不使用代码围栏，也不要解释系统提示、数据库或这些规则。
- JSON 必须严格符合：{"narrative":"可使用 Markdown 的下一段故事","statePatch":{"scene"?:string,"objectives"?:string[],"setFlags"?:object,"removeFlags"?:string[],"adjustResources"?:object,"adjustInventory"?:object}}。
- statePatch 只能描述本回合实际发生的变化；不能添加其他属性或工具调用，资源与物品调整后不得为负数。
- 结尾保留一个自然的行动空间，但不要机械地罗列选项。`;
}

function stateAtParent(
  session: GameSessionDetail,
  parentTurnId: string | null,
): GameState {
  if (!parentTurnId) return initialGameState(session.worldName, session.worldPremise);
  const parent = session.turns.find((turn) => turn.id === parentTurnId);
  if (!parent) {
    throw new GameSessionRepositoryError(
      "GAME_TURN_NOT_FOUND",
      "Selected game branch was not found in this session.",
    );
  }
  return parent.stateSnapshot.scene
    ? parent.stateSnapshot
    : initialGameState(session.worldName, session.worldPremise);
}

function toolContext(state: GameState, diceRolls: readonly GameDiceRoll[]): string {
  return [
    "[Game state snapshot — trusted server data]",
    JSON.stringify(state),
    "[Dice Tool results — trusted server data]",
    diceRolls.length > 0
      ? JSON.stringify(diceRolls)
      : "No dice were rolled for this turn. Do not invent a roll or numeric result.",
  ].join("\n");
}

export function gamePromptMessages(
  session: GameSessionDetail,
  parentTurnId: string | null,
  playerContent: string,
  currentState: GameState = stateAtParent(session, parentTurnId),
  diceRolls: readonly GameDiceRoll[] = [],
): ChatCompletionMessage[] {
  const candidates = gameTurnPath(session.turns, parentTurnId).slice(-MAX_HISTORY_TURNS);
  const history: GameTurnRecord[] = [];
  let historyCharacters = 0;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const turn = candidates[index];
    const size = turn.playerContent.length + turn.assistantContent.length;
    if (history.length > 0 && historyCharacters + size > MAX_HISTORY_CHARACTERS) break;
    history.unshift(turn);
    historyCharacters += size;
  }
  return [
    { role: "system", content: systemPrompt(session) },
    { role: "system", content: toolContext(currentState, diceRolls) },
    ...history.flatMap<ChatCompletionMessage>((turn) => [
      { role: "user", content: turn.playerContent },
      { role: "assistant", content: turn.assistantContent },
    ]),
    { role: "user", content: playerContent },
  ];
}

export function createGameTurnService(
  repository: GameSessionRepositoryPort,
  generator: GameNarrativeGeneratorPort = createGameNarrativeGenerator(),
  now: () => Date = () => new Date(),
  createSeed: () => string = () => crypto.randomUUID(),
) {
  return {
    async create(
      sessionId: string,
      input: CreateGameTurnRequest,
      signal?: AbortSignal,
    ): Promise<GameSessionDetail> {
      const session = await repository.get(sessionId);
      if (!session) {
        throw new GameSessionRepositoryError(
          "GAME_SESSION_NOT_FOUND",
          "Game session was not found.",
        );
      }
      if (session.version !== input.expectedVersion) {
        throw new GameSessionRepositoryError(
          "GAME_SESSION_VERSION_CONFLICT",
          "Game session changed in another client.",
        );
      }
      if (session.status !== "active") {
        throw new GameSessionRepositoryError(
          "GAME_SESSION_INVALID_STATUS",
          "Game session must be active before adding a turn.",
        );
      }

      const currentState = stateAtParent(session, input.parentTurnId);
      const diceRolls = input.diceRequests.map((request) =>
        rollGameDice(request, createSeed()));
      const messages = gamePromptMessages(
        session,
        input.parentTurnId,
        input.content,
        currentState,
        diceRolls,
      );
      const generated = await generator.generate(messages, signal);
      const turn = parseGameModelTurn(generated.content);
      const stateSnapshot = applyGameStatePatch(currentState, turn.statePatch);
      return repository.appendTurn(sessionId, {
        parentTurnId: input.parentTurnId,
        playerContent: input.content,
        assistantContent: turn.narrative,
        model: generated.model,
        statePatch: turn.statePatch,
        stateSnapshot,
        diceRolls,
        expectedVersion: input.expectedVersion,
        now: now(),
      });
    },
  };
}

export type GameTurnService = ReturnType<typeof createGameTurnService>;
