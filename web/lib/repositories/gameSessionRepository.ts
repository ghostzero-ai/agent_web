import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type {
  GameCharacterInput,
  GameSessionKind,
  GameSessionStatus,
  GameWorldInput,
} from "@/lib/game/contracts";
import {
  gameCharacters,
  gameEvents,
  gameSessions,
  gameTurns,
  users,
  type GameCharacterRecord,
  type GameEventRecord,
  type GameSessionRecord,
  type GameTurnRecord,
} from "@/lib/db/schema";
import type { GameDiceRoll } from "@/lib/game/dice";
import type { GameState, GameStatePatch } from "@/lib/game/state";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type GameSessionDetail = GameSessionRecord & {
  characters: GameCharacterRecord[];
  turns: GameTurnRecord[];
  events: GameEventRecord[];
};

export type CreateGameSessionInput = {
  title: string;
  kind: GameSessionKind;
  world: GameWorldInput;
  initialCharacter: GameCharacterInput | null;
  now: Date;
};

export type UpdateGameSessionInput = Omit<
  CreateGameSessionInput,
  "initialCharacter"
> & { expectedVersion: number };

export type CharacterMutationInput = GameCharacterInput & {
  expectedSessionVersion: number;
  now: Date;
};

export type UpdateGameCharacterInput = CharacterMutationInput & {
  expectedCharacterVersion: number;
};

export type DeleteGameCharacterInput = {
  expectedSessionVersion: number;
  expectedCharacterVersion: number;
  now: Date;
};

export type UpdateGameSessionStatusInput = {
  status: Extract<GameSessionStatus, "active" | "paused">;
  expectedVersion: number;
  now: Date;
};

export type AppendGameTurnInput = {
  parentTurnId: string | null;
  playerContent: string;
  assistantContent: string;
  model: string;
  statePatch: GameStatePatch;
  stateSnapshot: GameState;
  diceRolls: GameDiceRoll[];
  expectedVersion: number;
  now: Date;
};

export class GameSessionRepositoryError extends Error {
  constructor(
    readonly code:
      | "GAME_SESSION_NOT_FOUND"
      | "GAME_CHARACTER_NOT_FOUND"
      | "GAME_TURN_NOT_FOUND"
      | "GAME_SESSION_VERSION_CONFLICT"
      | "GAME_CHARACTER_VERSION_CONFLICT"
      | "GAME_SESSION_INVALID_STATUS",
    message: string,
  ) {
    super(message);
    this.name = "GameSessionRepositoryError";
  }
}

export interface GameSessionRepositoryPort {
  list(): Promise<GameSessionRecord[]>;
  create(input: CreateGameSessionInput): Promise<GameSessionDetail>;
  get(id: string): Promise<GameSessionDetail | null>;
  update(id: string, input: UpdateGameSessionInput): Promise<GameSessionDetail>;
  delete(id: string, expectedVersion: number): Promise<void>;
  createCharacter(
    sessionId: string,
    input: CharacterMutationInput,
  ): Promise<GameSessionDetail>;
  updateCharacter(
    sessionId: string,
    characterId: string,
    input: UpdateGameCharacterInput,
  ): Promise<GameSessionDetail>;
  deleteCharacter(
    sessionId: string,
    characterId: string,
    input: DeleteGameCharacterInput,
  ): Promise<GameSessionDetail>;
  updateStatus(
    sessionId: string,
    input: UpdateGameSessionStatusInput,
  ): Promise<GameSessionDetail>;
  appendTurn(
    sessionId: string,
    input: AppendGameTurnInput,
  ): Promise<GameSessionDetail>;
}

export class GameSessionRepository<
  TQueryResult extends PgQueryResultHKT,
> implements GameSessionRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  private async ensureLocalUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  async list(): Promise<GameSessionRecord[]> {
    await this.ensureLocalUser();
    return this.database
      .select()
      .from(gameSessions)
      .where(eq(gameSessions.userId, LOCAL_USER_ID))
      .orderBy(desc(gameSessions.updatedAt), desc(gameSessions.id));
  }

  async get(id: string): Promise<GameSessionDetail | null> {
    await this.ensureLocalUser();
    const [session] = await this.database
      .select()
      .from(gameSessions)
      .where(and(eq(gameSessions.id, id), eq(gameSessions.userId, LOCAL_USER_ID)))
      .limit(1);
    if (!session) return null;

    const characters = await this.database
      .select()
      .from(gameCharacters)
      .where(eq(gameCharacters.sessionId, id))
      .orderBy(asc(gameCharacters.createdAt), asc(gameCharacters.id));
    const turns = await this.database
      .select()
      .from(gameTurns)
      .where(eq(gameTurns.sessionId, id))
      .orderBy(asc(gameTurns.createdAt), asc(gameTurns.id));
    const events = await this.database
      .select()
      .from(gameEvents)
      .where(eq(gameEvents.sessionId, id))
      .orderBy(asc(gameEvents.createdAt), asc(gameEvents.sequence), asc(gameEvents.id));
    return { ...session, characters, turns, events };
  }

  async create(input: CreateGameSessionInput): Promise<GameSessionDetail> {
    await this.ensureLocalUser();
    const sessionId = await this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .insert(gameSessions)
        .values({
          userId: LOCAL_USER_ID,
          title: input.title,
          kind: input.kind,
          worldName: input.world.name,
          worldPremise: input.world.premise,
          worldTone: input.world.tone,
          worldRules: input.world.rules,
          safetyBoundaries: input.world.boundaries,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .returning({ id: gameSessions.id });
      if (input.initialCharacter) {
        await transaction.insert(gameCharacters).values({
          sessionId: session.id,
          ...input.initialCharacter,
          createdAt: input.now,
          updatedAt: input.now,
        });
      }
      return session.id;
    });
    return this.requireDetail(sessionId);
  }

  async update(
    id: string,
    input: UpdateGameSessionInput,
  ): Promise<GameSessionDetail> {
    await this.ensureLocalUser();
    const [updated] = await this.database
      .update(gameSessions)
      .set({
        title: input.title,
        kind: input.kind,
        worldName: input.world.name,
        worldPremise: input.world.premise,
        worldTone: input.world.tone,
        worldRules: input.world.rules,
        safetyBoundaries: input.world.boundaries,
        version: sql`${gameSessions.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(gameSessions.id, id),
          eq(gameSessions.userId, LOCAL_USER_ID),
          eq(gameSessions.version, input.expectedVersion),
        ),
      )
      .returning({ id: gameSessions.id });
    if (!updated) await this.throwSessionWriteFailure(id);
    return this.requireDetail(id);
  }

  async delete(id: string, expectedVersion: number): Promise<void> {
    await this.ensureLocalUser();
    const deleted = await this.database
      .delete(gameSessions)
      .where(
        and(
          eq(gameSessions.id, id),
          eq(gameSessions.userId, LOCAL_USER_ID),
          eq(gameSessions.version, expectedVersion),
        ),
      )
      .returning({ id: gameSessions.id });
    if (deleted.length === 0) await this.throwSessionWriteFailure(id);
  }

  async createCharacter(
    sessionId: string,
    input: CharacterMutationInput,
  ): Promise<GameSessionDetail> {
    await this.ensureLocalUser();
    await this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .select({ version: gameSessions.version })
        .from(gameSessions)
        .where(
          and(
            eq(gameSessions.id, sessionId),
            eq(gameSessions.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);
      this.assertSessionVersion(session?.version, input.expectedSessionVersion);
      await transaction.insert(gameCharacters).values({
        sessionId,
        name: input.name,
        role: input.role,
        controller: input.controller,
        description: input.description,
        personality: input.personality,
        goals: input.goals,
        boundaries: input.boundaries,
        createdAt: input.now,
        updatedAt: input.now,
      });
      await transaction
        .update(gameSessions)
        .set({
          version: sql`${gameSessions.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(gameSessions.id, sessionId));
    });
    return this.requireDetail(sessionId);
  }

  async updateCharacter(
    sessionId: string,
    characterId: string,
    input: UpdateGameCharacterInput,
  ): Promise<GameSessionDetail> {
    await this.ensureLocalUser();
    await this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .select({ version: gameSessions.version })
        .from(gameSessions)
        .where(
          and(
            eq(gameSessions.id, sessionId),
            eq(gameSessions.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);
      this.assertSessionVersion(session?.version, input.expectedSessionVersion);
      const [character] = await transaction
        .select({ version: gameCharacters.version })
        .from(gameCharacters)
        .where(
          and(
            eq(gameCharacters.id, characterId),
            eq(gameCharacters.sessionId, sessionId),
          ),
        )
        .for("update")
        .limit(1);
      this.assertCharacterVersion(character?.version, input.expectedCharacterVersion);
      await transaction
        .update(gameCharacters)
        .set({
          name: input.name,
          role: input.role,
          controller: input.controller,
          description: input.description,
          personality: input.personality,
          goals: input.goals,
          boundaries: input.boundaries,
          version: sql`${gameCharacters.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(gameCharacters.id, characterId));
      await transaction
        .update(gameSessions)
        .set({
          version: sql`${gameSessions.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(gameSessions.id, sessionId));
    });
    return this.requireDetail(sessionId);
  }

  async deleteCharacter(
    sessionId: string,
    characterId: string,
    input: DeleteGameCharacterInput,
  ): Promise<GameSessionDetail> {
    await this.ensureLocalUser();
    await this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .select({ version: gameSessions.version })
        .from(gameSessions)
        .where(
          and(
            eq(gameSessions.id, sessionId),
            eq(gameSessions.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);
      this.assertSessionVersion(session?.version, input.expectedSessionVersion);
      const [character] = await transaction
        .select({ version: gameCharacters.version })
        .from(gameCharacters)
        .where(
          and(
            eq(gameCharacters.id, characterId),
            eq(gameCharacters.sessionId, sessionId),
          ),
        )
        .for("update")
        .limit(1);
      this.assertCharacterVersion(character?.version, input.expectedCharacterVersion);
      await transaction.delete(gameCharacters).where(eq(gameCharacters.id, characterId));
      await transaction
        .update(gameSessions)
        .set({
          version: sql`${gameSessions.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(gameSessions.id, sessionId));
    });
    return this.requireDetail(sessionId);
  }

  async updateStatus(
    sessionId: string,
    input: UpdateGameSessionStatusInput,
  ): Promise<GameSessionDetail> {
    await this.ensureLocalUser();
    await this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .select({
          status: gameSessions.status,
          version: gameSessions.version,
        })
        .from(gameSessions)
        .where(
          and(
            eq(gameSessions.id, sessionId),
            eq(gameSessions.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);
      this.assertSessionVersion(session?.version, input.expectedVersion);

      const allowed = input.status === "active"
        ? session?.status === "setup" || session?.status === "paused"
        : session?.status === "active";
      if (!allowed) {
        throw new GameSessionRepositoryError(
          "GAME_SESSION_INVALID_STATUS",
          `Game session cannot change from ${session?.status} to ${input.status}.`,
        );
      }
      await transaction
        .update(gameSessions)
        .set({
          status: input.status,
          version: sql`${gameSessions.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(gameSessions.id, sessionId));
    });
    return this.requireDetail(sessionId);
  }

  async appendTurn(
    sessionId: string,
    input: AppendGameTurnInput,
  ): Promise<GameSessionDetail> {
    await this.ensureLocalUser();
    await this.database.transaction(async (transaction) => {
      const [session] = await transaction
        .select({
          status: gameSessions.status,
          version: gameSessions.version,
        })
        .from(gameSessions)
        .where(
          and(
            eq(gameSessions.id, sessionId),
            eq(gameSessions.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);
      this.assertSessionVersion(session?.version, input.expectedVersion);
      if (session?.status !== "active") {
        throw new GameSessionRepositoryError(
          "GAME_SESSION_INVALID_STATUS",
          "Game session must be active before adding a turn.",
        );
      }

      if (input.parentTurnId) {
        const [parent] = await transaction
          .select({ id: gameTurns.id })
          .from(gameTurns)
          .where(
            and(
              eq(gameTurns.id, input.parentTurnId),
              eq(gameTurns.sessionId, sessionId),
            ),
          )
          .limit(1);
        if (!parent) {
          throw new GameSessionRepositoryError(
            "GAME_TURN_NOT_FOUND",
            "Parent game turn was not found in this session.",
          );
        }
      }

      const [turn] = await transaction
        .insert(gameTurns)
        .values({
          sessionId,
          parentTurnId: input.parentTurnId,
          playerContent: input.playerContent,
          assistantContent: input.assistantContent,
          model: input.model,
          statePatch: input.statePatch,
          stateSnapshot: input.stateSnapshot,
          createdAt: input.now,
        })
        .returning({ id: gameTurns.id });
      if (input.diceRolls.length > 0) {
        await transaction.insert(gameEvents).values(
          input.diceRolls.map((payload, sequence) => ({
            sessionId,
            turnId: turn.id,
            kind: "dice_roll" as const,
            sequence,
            payload,
            createdAt: input.now,
          })),
        );
      }
      await transaction
        .update(gameSessions)
        .set({
          activeLeafTurnId: turn.id,
          version: sql`${gameSessions.version} + 1`,
          updatedAt: input.now,
        })
        .where(eq(gameSessions.id, sessionId));
    });
    return this.requireDetail(sessionId);
  }

  private assertSessionVersion(
    actual: number | undefined,
    expected: number,
  ): void {
    if (actual === undefined) {
      throw new GameSessionRepositoryError(
        "GAME_SESSION_NOT_FOUND",
        "Game session was not found.",
      );
    }
    if (actual !== expected) {
      throw new GameSessionRepositoryError(
        "GAME_SESSION_VERSION_CONFLICT",
        "Game session changed in another client.",
      );
    }
  }

  private assertCharacterVersion(
    actual: number | undefined,
    expected: number,
  ): void {
    if (actual === undefined) {
      throw new GameSessionRepositoryError(
        "GAME_CHARACTER_NOT_FOUND",
        "Game character was not found.",
      );
    }
    if (actual !== expected) {
      throw new GameSessionRepositoryError(
        "GAME_CHARACTER_VERSION_CONFLICT",
        "Game character changed in another client.",
      );
    }
  }

  private async throwSessionWriteFailure(id: string): Promise<never> {
    const [existing] = await this.database
      .select({ id: gameSessions.id })
      .from(gameSessions)
      .where(and(eq(gameSessions.id, id), eq(gameSessions.userId, LOCAL_USER_ID)))
      .limit(1);
    throw new GameSessionRepositoryError(
      existing ? "GAME_SESSION_VERSION_CONFLICT" : "GAME_SESSION_NOT_FOUND",
      existing
        ? "Game session changed in another client."
        : "Game session was not found.",
    );
  }

  private async requireDetail(id: string): Promise<GameSessionDetail> {
    const detail = await this.get(id);
    if (!detail) {
      throw new GameSessionRepositoryError(
        "GAME_SESSION_NOT_FOUND",
        "Game session was not found.",
      );
    }
    return detail;
  }
}

export function createGameSessionRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return new GameSessionRepository(database);
}
