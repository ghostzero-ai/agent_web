import { and, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { personaProfiles, users, type PersonaProfileRecord } from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type UpdatePersonaProfileInput = {
  name: string;
  preferredAddress: string | null;
  warmth: number;
  humor: number;
  directness: number;
  verbosity: number;
  initiative: number;
  expectedVersion: number;
  now: Date;
};

export class PersonaProfileRepositoryError extends Error {
  constructor(
    readonly code: "PERSONA_PROFILE_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "PersonaProfileRepositoryError";
  }
}

export interface PersonaProfileRepositoryPort {
  get(): Promise<PersonaProfileRecord>;
  update(input: UpdatePersonaProfileInput): Promise<PersonaProfileRecord>;
}

export class PersonaProfileRepository<TQueryResult extends PgQueryResultHKT>
  implements PersonaProfileRepositoryPort
{
  constructor(private readonly database: PgDatabase<TQueryResult, typeof schema>) {}

  async get(): Promise<PersonaProfileRecord> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
    await this.database
      .insert(personaProfiles)
      .values({ userId: LOCAL_USER_ID })
      .onConflictDoNothing({ target: personaProfiles.userId });
    const [profile] = await this.database
      .select()
      .from(personaProfiles)
      .where(eq(personaProfiles.userId, LOCAL_USER_ID))
      .limit(1);
    if (!profile) throw new Error("Persona profile was not persisted.");
    return profile;
  }

  async update(input: UpdatePersonaProfileInput): Promise<PersonaProfileRecord> {
    await this.get();
    const [profile] = await this.database
      .update(personaProfiles)
      .set({
        name: input.name,
        preferredAddress: input.preferredAddress,
        warmth: input.warmth,
        humor: input.humor,
        directness: input.directness,
        verbosity: input.verbosity,
        initiative: input.initiative,
        version: sql`${personaProfiles.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(personaProfiles.userId, LOCAL_USER_ID),
          eq(personaProfiles.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!profile) {
      throw new PersonaProfileRepositoryError(
        "PERSONA_PROFILE_VERSION_CONFLICT",
        "Persona profile changed in another client.",
      );
    }
    return profile;
  }
}

export function createPersonaProfileRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new PersonaProfileRepository(database);
}
