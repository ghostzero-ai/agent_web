import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { users, voiceProfiles, type VoiceProfileRecord } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type UpdateVoiceProfileInput = {
  provider: "system";
  voiceId: string | null;
  language: string;
  rate: number;
  pitch: number;
  volume: number;
  expectedVersion: number;
  now: Date;
};

export class VoiceProfileRepositoryError extends Error {
  constructor(
    readonly code: "VOICE_PROFILE_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "VoiceProfileRepositoryError";
  }
}

export interface VoiceProfileRepositoryPort {
  get(): Promise<VoiceProfileRecord>;
  update(input: UpdateVoiceProfileInput): Promise<VoiceProfileRecord>;
}

export class VoiceProfileRepository<TQueryResult extends PgQueryResultHKT>
  implements VoiceProfileRepositoryPort
{
  constructor(private readonly database: PgDatabase<TQueryResult, typeof schema>) {}

  async get(): Promise<VoiceProfileRecord> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
    await this.database
      .insert(voiceProfiles)
      .values({ userId: LOCAL_USER_ID })
      .onConflictDoNothing({ target: voiceProfiles.userId });
    const [profile] = await this.database
      .select()
      .from(voiceProfiles)
      .where(eq(voiceProfiles.userId, LOCAL_USER_ID))
      .limit(1);
    if (!profile) throw new Error("Voice profile was not persisted.");
    return profile;
  }

  async update(input: UpdateVoiceProfileInput): Promise<VoiceProfileRecord> {
    await this.get();
    const [profile] = await this.database
      .update(voiceProfiles)
      .set({
        provider: input.provider,
        voiceId: input.voiceId,
        language: input.language,
        rate: input.rate,
        pitch: input.pitch,
        volume: input.volume,
        version: sql`${voiceProfiles.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(voiceProfiles.userId, LOCAL_USER_ID),
          eq(voiceProfiles.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!profile) {
      throw new VoiceProfileRepositoryError(
        "VOICE_PROFILE_VERSION_CONFLICT",
        "Voice profile changed in another client.",
      );
    }
    return profile;
  }
}

export function createVoiceProfileRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new VoiceProfileRepository(database);
}
