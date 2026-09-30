import { z } from "zod";
import {
  GAME_DICE_SIDES,
  gameDiceRollSchema,
  rollGameDice,
} from "@/lib/game/dice";

export const GAME_CHECK_OUTCOMES = [
  "critical-success",
  "success",
  "failure",
  "critical-failure",
] as const;

export const gameRuleCheckRequestSchema = z
  .object({
    characterId: z.uuid(),
    attribute: z.string().trim().min(1).max(80),
    difficulty: z.number().int().min(-100).max(200),
    count: z.number().int().min(1).max(20).default(1),
    sides: z.union(GAME_DICE_SIDES.map((sides) => z.literal(sides))).default(20),
    purpose: z.string().trim().min(1).max(120),
  })
  .strict();

export const gameRuleCheckSchema = gameRuleCheckRequestSchema
  .extend({
    characterName: z.string().trim().min(1).max(120),
    modifier: z.number().int().min(-100).max(100),
    dice: gameDiceRollSchema,
    total: z.number().int().min(-100).max(2_100),
    margin: z.number().int().min(-2_200).max(2_200),
    outcome: z.enum(GAME_CHECK_OUTCOMES),
  })
  .strict();

export type GameRuleCheckRequest = z.infer<typeof gameRuleCheckRequestSchema>;
export type GameRuleCheck = z.infer<typeof gameRuleCheckSchema>;

export class GameRuleCheckError extends Error {
  constructor(
    readonly code: "GAME_CHECK_CHARACTER_NOT_FOUND" | "GAME_CHECK_ATTRIBUTE_NOT_FOUND",
    message: string,
  ) {
    super(message);
    this.name = "GameRuleCheckError";
  }
}

export function rollGameRuleCheck(
  rawRequest: GameRuleCheckRequest,
  character: {
    name: string;
    attributes: Readonly<Record<string, number>>;
  } | undefined,
  seed: string,
): GameRuleCheck {
  const request = gameRuleCheckRequestSchema.parse(rawRequest);
  if (!character) {
    throw new GameRuleCheckError(
      "GAME_CHECK_CHARACTER_NOT_FOUND",
      "The selected character is not present on this game branch.",
    );
  }
  const modifier = character.attributes[request.attribute];
  if (modifier === undefined) {
    throw new GameRuleCheckError(
      "GAME_CHECK_ATTRIBUTE_NOT_FOUND",
      `The selected character does not have the “${request.attribute}” attribute.`,
    );
  }
  const dice = rollGameDice({
    count: request.count,
    sides: request.sides,
    modifier,
    purpose: request.purpose,
  }, seed);
  const natural = request.count === 1 && request.sides === 20
    ? dice.results[0]
    : null;
  const outcome = natural === 20
    ? "critical-success"
    : natural === 1
      ? "critical-failure"
      : dice.total >= request.difficulty
        ? "success"
        : "failure";
  return gameRuleCheckSchema.parse({
    ...request,
    characterName: character.name,
    modifier,
    dice,
    total: dice.total,
    margin: dice.total - request.difficulty,
    outcome,
  });
}
