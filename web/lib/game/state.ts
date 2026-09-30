import { z } from "zod";

const stateKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[\p{L}\p{N}_.:-]+$/u, "State keys may only contain letters, numbers, _, ., : or -.");
const stateScalarSchema = z.union([
  z.boolean(),
  z.number().finite().min(-1_000_000).max(1_000_000),
  z.string().trim().max(300),
]);
const stateCountSchema = z.number().int().min(0).max(1_000_000);
const stateDeltaSchema = z.number().int().min(-1_000_000).max(1_000_000);

const limitedRecord = <T extends z.ZodType>(value: T, maxKeys: number) =>
  z.record(stateKeySchema, value).refine(
    (record) => Object.keys(record).length <= maxKeys,
    `No more than ${maxKeys} keys are allowed.`,
  );

const uniqueStateKeys = (maxItems: number) =>
  z.array(stateKeySchema).max(maxItems).transform((items) => [...new Set(items)]);

const objectivesSchema = z
  .array(z.string().trim().min(1).max(300))
  .max(20)
  .transform((items) => [...new Set(items)]);

export const gameStateSchema = z
  .object({
    scene: z.string().trim().max(1_000),
    objectives: objectivesSchema,
    flags: limitedRecord(stateScalarSchema, 100),
    resources: limitedRecord(stateCountSchema, 50),
    inventory: limitedRecord(stateCountSchema, 100),
  })
  .strict();

export const gameStatePatchSchema = z
  .object({
    scene: z.string().trim().min(1).max(1_000).optional(),
    objectives: objectivesSchema.optional(),
    setFlags: limitedRecord(stateScalarSchema, 50).optional(),
    removeFlags: uniqueStateKeys(50).optional(),
    adjustResources: limitedRecord(stateDeltaSchema, 50).optional(),
    adjustInventory: limitedRecord(stateDeltaSchema, 100).optional(),
  })
  .strict();

export const gameModelTurnSchema = z
  .object({
    narrative: z.string().trim().min(1).max(100_000),
    statePatch: gameStatePatchSchema,
  })
  .strict();

export type GameState = z.infer<typeof gameStateSchema>;
export type GameStatePatch = z.infer<typeof gameStatePatchSchema>;
export type GameModelTurn = z.infer<typeof gameModelTurnSchema>;

export class GameStateValidationError extends Error {
  constructor(
    readonly code: "GAME_OUTPUT_INVALID" | "GAME_STATE_INVALID",
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "GameStateValidationError";
  }
}

export function initialGameState(worldName: string, worldPremise: string): GameState {
  return gameStateSchema.parse({
    scene: `${worldName}：${worldPremise}`.slice(0, 1_000),
    objectives: [],
    flags: {},
    resources: {},
    inventory: {},
  });
}

function applyDeltas(
  current: Readonly<Record<string, number>>,
  deltas: Readonly<Record<string, number>> | undefined,
  label: string,
): Record<string, number> {
  const next = { ...current };
  for (const [key, delta] of Object.entries(deltas ?? {})) {
    const value = (next[key] ?? 0) + delta;
    if (!Number.isSafeInteger(value) || value < 0 || value > 1_000_000) {
      throw new GameStateValidationError(
        "GAME_STATE_INVALID",
        `${label} “${key}” cannot become negative or exceed the supported range.`,
      );
    }
    if (value === 0) delete next[key];
    else next[key] = value;
  }
  return next;
}

export function applyGameStatePatch(
  rawCurrent: GameState,
  rawPatch: GameStatePatch,
): GameState {
  const currentResult = gameStateSchema.safeParse(rawCurrent);
  const patchResult = gameStatePatchSchema.safeParse(rawPatch);
  if (!currentResult.success || !patchResult.success) {
    const details = !currentResult.success
      ? currentResult.error.issues
      : !patchResult.success
        ? patchResult.error.issues
        : undefined;
    throw new GameStateValidationError(
      "GAME_STATE_INVALID",
      "The current game state or requested patch is invalid.",
      details,
    );
  }
  const current = currentResult.data;
  const patch = patchResult.data;
  const flags = { ...current.flags, ...(patch.setFlags ?? {}) };
  for (const key of patch.removeFlags ?? []) delete flags[key];
  const result = gameStateSchema.safeParse({
    scene: patch.scene ?? current.scene,
    objectives: patch.objectives ?? current.objectives,
    flags,
    resources: applyDeltas(current.resources, patch.adjustResources, "Resource"),
    inventory: applyDeltas(current.inventory, patch.adjustInventory, "Inventory item"),
  });
  if (!result.success) {
    throw new GameStateValidationError(
      "GAME_STATE_INVALID",
      "The state patch would produce an invalid game state.",
      result.error.issues,
    );
  }
  return result.data;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/iu);
  return match?.[1]?.trim() ?? trimmed;
}

export function parseGameModelTurn(value: string): GameModelTurn {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(value));
  } catch {
    throw new GameStateValidationError(
      "GAME_OUTPUT_INVALID",
      "The model did not return the required structured game turn JSON.",
    );
  }
  const result = gameModelTurnSchema.safeParse(parsed);
  if (!result.success) {
    throw new GameStateValidationError(
      "GAME_OUTPUT_INVALID",
      "The model returned an invalid or unauthorized game state patch.",
      result.error.issues,
    );
  }
  return result.data;
}
