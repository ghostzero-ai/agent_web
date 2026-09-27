import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  conversations,
  memoryCandidates,
  memoryItems,
  messages,
  type MemoryCandidateKind,
  type MemoryItemRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import type { RetrievedMemory } from "@/lib/memory/memoryRetrieval";
import { rankMemories } from "@/lib/memory/memoryRetrieval";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export type UpdateMemoryInput = {
  id: string;
  content: string;
  kind: MemoryCandidateKind;
  pinned: boolean;
  validUntil: Date | null;
  expectedVersion: number;
  now: Date;
};

export type MemoryItemView = MemoryItemRecord & {
  evidenceQuote: string;
};

export class MemoryRepositoryError extends Error {
  constructor(
    readonly code: "MEMORY_NOT_FOUND" | "MEMORY_VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "MemoryRepositoryError";
  }
}

export interface MemoryRepositoryPort {
  list(): Promise<MemoryItemView[]>;
  retrieve(query: string, now: Date): Promise<RetrievedMemory[]>;
  retrieveForMessage(
    conversationId: string,
    messageId: string,
    now: Date,
  ): Promise<RetrievedMemory[]>;
  update(input: UpdateMemoryInput): Promise<MemoryItemRecord>;
  delete(id: string, expectedVersion: number): Promise<void>;
}

export class MemoryRepository<TQueryResult extends PgQueryResultHKT>
  implements MemoryRepositoryPort
{
  constructor(private readonly database: PgDatabase<TQueryResult, typeof schema>) {}

  async list(): Promise<MemoryItemView[]> {
    const rows = await this.database
      .select({ item: memoryItems, evidenceQuote: memoryCandidates.evidenceQuote })
      .from(memoryItems)
      .innerJoin(memoryCandidates, eq(memoryItems.candidateId, memoryCandidates.id))
      .where(eq(memoryItems.userId, LOCAL_USER_ID))
      .orderBy(desc(memoryItems.pinned), desc(memoryItems.updatedAt), desc(memoryItems.id));
    return rows.map(({ item, evidenceQuote }) => ({ ...item, evidenceQuote }));
  }

  async retrieve(query: string, now: Date): Promise<RetrievedMemory[]> {
    const active = await this.database
      .select()
      .from(memoryItems)
      .where(
        and(
          eq(memoryItems.userId, LOCAL_USER_ID),
          or(isNull(memoryItems.validUntil), gt(memoryItems.validUntil, now)),
        ),
      )
      .orderBy(desc(memoryItems.pinned), desc(memoryItems.updatedAt))
      .limit(500);
    return rankMemories(active, query, now);
  }

  async retrieveForMessage(
    conversationId: string,
    messageId: string,
    now: Date,
  ): Promise<RetrievedMemory[]> {
    const [source] = await this.database
      .select({ content: messages.content, role: messages.role })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.id, conversationId),
          eq(conversations.userId, LOCAL_USER_ID),
          eq(messages.id, messageId),
        ),
      )
      .limit(1);
    if (!source || source.role !== "user") return [];
    return this.retrieve(source.content, now);
  }

  async update(input: UpdateMemoryInput): Promise<MemoryItemRecord> {
    const [updated] = await this.database
      .update(memoryItems)
      .set({
        content: input.content,
        kind: input.kind,
        pinned: input.pinned,
        validUntil: input.validUntil,
        version: sql`${memoryItems.version} + 1`,
        updatedAt: input.now,
      })
      .where(
        and(
          eq(memoryItems.id, input.id),
          eq(memoryItems.userId, LOCAL_USER_ID),
          eq(memoryItems.version, input.expectedVersion),
        ),
      )
      .returning();
    if (updated) return updated;
    await this.throwMissingOrConflict(input.id);
    throw new MemoryRepositoryError(
      "MEMORY_VERSION_CONFLICT",
      "Memory changed in another client.",
    );
  }

  async delete(id: string, expectedVersion: number): Promise<void> {
    const [deleted] = await this.database
      .delete(memoryItems)
      .where(
        and(
          eq(memoryItems.id, id),
          eq(memoryItems.userId, LOCAL_USER_ID),
          eq(memoryItems.version, expectedVersion),
        ),
      )
      .returning({ id: memoryItems.id });
    if (deleted) return;
    await this.throwMissingOrConflict(id);
    throw new MemoryRepositoryError(
      "MEMORY_VERSION_CONFLICT",
      "Memory changed in another client.",
    );
  }

  private async throwMissingOrConflict(id: string): Promise<void> {
    const [existing] = await this.database
      .select({ id: memoryItems.id })
      .from(memoryItems)
      .where(and(eq(memoryItems.id, id), eq(memoryItems.userId, LOCAL_USER_ID)))
      .limit(1);
    if (!existing) {
      throw new MemoryRepositoryError("MEMORY_NOT_FOUND", "Memory was not found.");
    }
  }
}

export function createMemoryRepository<TQueryResult extends PgQueryResultHKT>(
  database: PgDatabase<TQueryResult, typeof schema>,
) {
  return new MemoryRepository(database);
}
