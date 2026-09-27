import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  reflectionPreferences,
  users,
  type ReflectionPreferenceRecord,
  type ReflectionStyle,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type UpdateReflectionPreferenceInput = {
  enabled: boolean;
  goals: string[];
  avoidTopics: string[];
  style: ReflectionStyle;
  maxQuestions: number;
  expectedVersion: number;
  now: Date;
};

export class ReflectionPreferenceRepositoryError extends Error {
  constructor(
    readonly code: "REFLECTION_PREFERENCE_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ReflectionPreferenceRepositoryError";
  }
}

export interface ReflectionPreferenceRepositoryPort {
  get(): Promise<ReflectionPreferenceRecord>;
  update(
    input: UpdateReflectionPreferenceInput,
  ): Promise<ReflectionPreferenceRecord>;
}

export class ReflectionPreferenceRepository<
  TQueryResult extends PgQueryResultHKT,
> implements ReflectionPreferenceRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async get(): Promise<ReflectionPreferenceRecord> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
    await this.database
      .insert(reflectionPreferences)
      .values({ userId: LOCAL_USER_ID })
      .onConflictDoNothing({ target: reflectionPreferences.userId });
    const [preferences] = await this.database
      .select()
      .from(reflectionPreferences)
      .where(eq(reflectionPreferences.userId, LOCAL_USER_ID))
      .limit(1);
    if (!preferences) throw new Error("Reflection preferences were not persisted.");
    return preferences;
  }

  async update(
    input: UpdateReflectionPreferenceInput,
  ): Promise<ReflectionPreferenceRecord> {
    await this.get();
    const [preferences] = await this.database
      .update(reflectionPreferences)
      .set({
        enabled: input.enabled,
        goals: input.goals,
        avoidTopics: input.avoidTopics,
        style: input.style,
        maxQuestions: input.maxQuestions,
        version: sql`${reflectionPreferences.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(reflectionPreferences.userId, LOCAL_USER_ID),
          eq(reflectionPreferences.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!preferences) {
      throw new ReflectionPreferenceRepositoryError(
        "REFLECTION_PREFERENCE_VERSION_CONFLICT",
        "Reflection preferences changed in another client.",
      );
    }
    return preferences;
  }
}

export function createReflectionPreferenceRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return new ReflectionPreferenceRepository(database);
}
