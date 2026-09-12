import { eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  modelCredentials,
  users,
  type ModelCredentialRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export const OPENAI_COMPATIBLE_PROVIDER = "openai-compatible";

export type SaveModelCredentialInput = {
  provider: string;
  baseUrl: string;
  model: string;
  encryptedApiKey: string;
  apiKeyHint: string;
  encryptionKeyVersion: number;
};

export interface ModelCredentialRepositoryPort {
  get(): Promise<ModelCredentialRecord | null>;
  save(input: SaveModelCredentialInput): Promise<ModelCredentialRecord>;
  delete(): Promise<boolean>;
}

export class ModelCredentialRepository<
  TQueryResult extends PgQueryResultHKT,
> implements ModelCredentialRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  private async ensureLocalUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  async get(): Promise<ModelCredentialRecord | null> {
    await this.ensureLocalUser();
    const [credential] = await this.database
      .select()
      .from(modelCredentials)
      .where(eq(modelCredentials.userId, LOCAL_USER_ID))
      .limit(1);
    return credential ?? null;
  }

  async save(input: SaveModelCredentialInput): Promise<ModelCredentialRecord> {
    await this.ensureLocalUser();
    const [credential] = await this.database
      .insert(modelCredentials)
      .values({
        userId: LOCAL_USER_ID,
        ...input,
      })
      .onConflictDoUpdate({
        target: modelCredentials.userId,
        set: {
          provider: input.provider,
          baseUrl: input.baseUrl,
          model: input.model,
          encryptedApiKey: input.encryptedApiKey,
          apiKeyHint: input.apiKeyHint,
          encryptionKeyVersion: input.encryptionKeyVersion,
          version: sql`${modelCredentials.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return credential;
  }

  async delete(): Promise<boolean> {
    await this.ensureLocalUser();
    const deleted = await this.database
      .delete(modelCredentials)
      .where(eq(modelCredentials.userId, LOCAL_USER_ID))
      .returning({ id: modelCredentials.id });
    return deleted.length > 0;
  }
}

export function createModelCredentialRepository<
  TQueryResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TQueryResult, typeof schema>,
): ModelCredentialRepository<TQueryResult> {
  return new ModelCredentialRepository(database);
}
