import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  readingProfiles,
  users,
  type ReadingDifficulty,
  type ReadingGoal,
  type ReadingProfileRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type UpdateReadingProfileInput = {
  topics: string[];
  readBooks: string[];
  wantToReadBooks: string[];
  dislikedBooks: string[];
  difficulty: ReadingDifficulty;
  weeklyMinutes: number;
  goal: ReadingGoal;
  expectedVersion: number;
  now: Date;
};

export class ReadingProfileRepositoryError extends Error {
  constructor(
    readonly code: "READING_PROFILE_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "ReadingProfileRepositoryError";
  }
}

export interface ReadingProfileRepositoryPort {
  get(): Promise<ReadingProfileRecord>;
  update(input: UpdateReadingProfileInput): Promise<ReadingProfileRecord>;
}

export class ReadingProfileRepository<
  TQueryResult extends PgQueryResultHKT,
> implements ReadingProfileRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  async get(): Promise<ReadingProfileRecord> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
    await this.database
      .insert(readingProfiles)
      .values({ userId: LOCAL_USER_ID })
      .onConflictDoNothing({ target: readingProfiles.userId });
    const [profile] = await this.database
      .select()
      .from(readingProfiles)
      .where(eq(readingProfiles.userId, LOCAL_USER_ID))
      .limit(1);
    if (!profile) throw new Error("Reading profile was not persisted.");
    return profile;
  }

  async update(input: UpdateReadingProfileInput): Promise<ReadingProfileRecord> {
    await this.get();
    const [profile] = await this.database
      .update(readingProfiles)
      .set({
        topics: input.topics,
        readBooks: input.readBooks,
        wantToReadBooks: input.wantToReadBooks,
        dislikedBooks: input.dislikedBooks,
        difficulty: input.difficulty,
        weeklyMinutes: input.weeklyMinutes,
        goal: input.goal,
        version: sql`${readingProfiles.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(readingProfiles.userId, LOCAL_USER_ID),
          eq(readingProfiles.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!profile) {
      throw new ReadingProfileRepositoryError(
        "READING_PROFILE_VERSION_CONFLICT",
        "Reading profile changed in another client.",
      );
    }
    return profile;
  }
}

export function createReadingProfileRepository<
  TQueryResult extends PgQueryResultHKT,
>(database: PgDatabase<TQueryResult, typeof schema>) {
  return new ReadingProfileRepository(database);
}
