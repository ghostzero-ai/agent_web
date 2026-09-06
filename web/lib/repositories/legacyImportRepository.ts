import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  conversationImports,
  conversations,
  messages,
  users,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export const LOCAL_STORAGE_IMPORT_SOURCE = "agent_chat_sessions";

export type LegacyImportMessage = {
  id: string;
  parentId: string | null;
  role: "user" | "assistant";
  content: string;
  createdAt: number;
};

export type LegacyImportSession = {
  id: string;
  title: string;
  messages: LegacyImportMessage[];
  updatedAt: number;
  activeLeafId: string | null;
};

export type LegacyImportPreview = {
  total: number;
  importable: number;
  alreadyImported: number;
  existingSourceIds: string[];
};

export type LegacyImportResult = LegacyImportPreview & {
  imported: number;
  conversationIds: string[];
};

export interface LegacyImportRepositoryPort {
  preview(sessions: LegacyImportSession[]): Promise<LegacyImportPreview>;
  importSessions(sessions: LegacyImportSession[]): Promise<LegacyImportResult>;
}

function toDate(timestamp: number): Date {
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function orderMessages(messagesToOrder: LegacyImportMessage[]) {
  const pending = new Map(
    messagesToOrder.map((message) => [message.id, message] as const),
  );
  const ordered: LegacyImportMessage[] = [];
  const emitted = new Set<string>();

  while (pending.size > 0) {
    let progressed = false;
    for (const [id, message] of pending) {
      if (message.parentId === null || emitted.has(message.parentId)) {
        ordered.push(message);
        emitted.add(id);
        pending.delete(id);
        progressed = true;
      }
    }
    if (!progressed) {
      throw new Error("Legacy conversation tree could not be ordered.");
    }
  }

  return ordered;
}

export class LegacyImportRepository<
  TQueryResult extends PgQueryResultHKT,
> implements LegacyImportRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  private async ensureLocalUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  private async existingSourceIds(sourceIds: string[]): Promise<string[]> {
    if (sourceIds.length === 0) return [];
    const existing: string[] = [];
    for (const sourceId of sourceIds) {
      const [record] = await this.database
        .select({ sourceId: conversationImports.sourceId })
        .from(conversationImports)
        .where(
          and(
            eq(conversationImports.userId, LOCAL_USER_ID),
            eq(conversationImports.source, LOCAL_STORAGE_IMPORT_SOURCE),
            eq(conversationImports.sourceId, sourceId),
          ),
        )
        .limit(1);
      if (record) existing.push(record.sourceId);
    }
    return existing;
  }

  async preview(sessions: LegacyImportSession[]): Promise<LegacyImportPreview> {
    await this.ensureLocalUser();
    const existingSourceIds = await this.existingSourceIds(
      sessions.map((session) => session.id),
    );
    return {
      total: sessions.length,
      importable: sessions.length - existingSourceIds.length,
      alreadyImported: existingSourceIds.length,
      existingSourceIds,
    };
  }

  async importSessions(
    sessionsToImport: LegacyImportSession[],
  ): Promise<LegacyImportResult> {
    await this.ensureLocalUser();
    const existingSourceIds = await this.existingSourceIds(
      sessionsToImport.map((session) => session.id),
    );
    const existing = new Set(existingSourceIds);
    const pending = sessionsToImport.filter((session) => !existing.has(session.id));
    const conversationIds: string[] = [];

    for (const session of pending) {
      const conversationId = await this.database.transaction(async (transaction) => {
        const [conversation] = await transaction
          .insert(conversations)
          .values({
            userId: LOCAL_USER_ID,
            title: session.title,
            mode: "auto",
            createdAt: toDate(
              Math.min(
                session.updatedAt,
                ...session.messages.map((message) => message.createdAt),
              ),
            ),
            updatedAt: toDate(session.updatedAt),
          })
          .returning({ id: conversations.id });

        const idMap = new Map<string, string>();
        for (const message of orderMessages(session.messages)) {
          const newId = crypto.randomUUID();
          idMap.set(message.id, newId);
          await transaction.insert(messages).values({
            id: newId,
            conversationId: conversation.id,
            parentMessageId: message.parentId
              ? (idMap.get(message.parentId) ?? null)
              : null,
            role: message.role,
            content: message.content,
            status: "complete",
            model: null,
            citations: [],
            createdAt: toDate(message.createdAt),
          });
        }

        const activeLeafMessageId = session.activeLeafId
          ? (idMap.get(session.activeLeafId) ?? null)
          : null;
        await transaction
          .update(conversations)
          .set({ activeLeafMessageId })
          .where(eq(conversations.id, conversation.id));

        await transaction.insert(conversationImports).values({
          userId: LOCAL_USER_ID,
          source: LOCAL_STORAGE_IMPORT_SOURCE,
          sourceId: session.id,
          conversationId: conversation.id,
        });

        return conversation.id;
      });
      conversationIds.push(conversationId);
    }

    return {
      total: sessionsToImport.length,
      importable: pending.length,
      alreadyImported: existingSourceIds.length,
      existingSourceIds,
      imported: conversationIds.length,
      conversationIds,
    };
  }
}

export function createLegacyImportRepository<
  TQueryResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TQueryResult, typeof schema>,
): LegacyImportRepository<TQueryResult> {
  return new LegacyImportRepository(database);
}
