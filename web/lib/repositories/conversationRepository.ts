import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  conversations,
  messages,
  users,
  type ConversationRecord,
  type MessageCitation,
  type MessageRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";

export const LOCAL_USER_ID = "00000000-0000-4000-8000-000000000001";

export type ConversationMode = ConversationRecord["mode"];
export type MessageRole = MessageRecord["role"];
export type MessageStatus = MessageRecord["status"];

export type ConversationSummary = ConversationRecord;
export type ConversationDetail = ConversationRecord & {
  messages: MessageRecord[];
};

export type CreateConversationInput = {
  title: string;
  mode: ConversationMode;
};

export type AppendMessageInput = {
  parentMessageId: string | null;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  model: string | null;
  citations: MessageCitation[];
};

export class RepositoryError extends Error {
  constructor(
    public readonly code:
      | "CONVERSATION_NOT_FOUND"
      | "MESSAGE_NOT_FOUND"
      | "INVALID_MESSAGE_PARENT"
      | "INVALID_ACTIVE_LEAF"
      | "VERSION_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export interface ConversationRepositoryPort {
  listConversations(): Promise<ConversationSummary[]>;
  createConversation(input: CreateConversationInput): Promise<ConversationSummary>;
  getConversation(id: string): Promise<ConversationDetail | null>;
  deleteConversation(id: string): Promise<boolean>;
  appendMessage(
    conversationId: string,
    input: AppendMessageInput,
  ): Promise<{ conversation: ConversationSummary; message: MessageRecord }>;
  setActiveLeaf(
    conversationId: string,
    messageId: string | null,
    expectedVersion: number,
  ): Promise<ConversationSummary>;
}

export class ConversationRepository<
  TQueryResult extends PgQueryResultHKT,
> implements ConversationRepositoryPort {
  constructor(
    private readonly database: PgDatabase<
      TQueryResult,
      typeof schema
    >,
  ) {}

  private async ensureLocalUser(): Promise<void> {
    await this.database
      .insert(users)
      .values({ id: LOCAL_USER_ID, displayName: "Local User" })
      .onConflictDoNothing({ target: users.id });
  }

  async listConversations(): Promise<ConversationSummary[]> {
    await this.ensureLocalUser();
    return this.database
      .select()
      .from(conversations)
      .where(eq(conversations.userId, LOCAL_USER_ID))
      .orderBy(desc(conversations.updatedAt), desc(conversations.id));
  }

  async createConversation(
    input: CreateConversationInput,
  ): Promise<ConversationSummary> {
    await this.ensureLocalUser();
    const [conversation] = await this.database
      .insert(conversations)
      .values({
        userId: LOCAL_USER_ID,
        title: input.title,
        mode: input.mode,
      })
      .returning();
    return conversation;
  }

  async getConversation(id: string): Promise<ConversationDetail | null> {
    await this.ensureLocalUser();
    const [conversation] = await this.database
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.userId, LOCAL_USER_ID),
        ),
      )
      .limit(1);

    if (!conversation) return null;

    const conversationMessages = await this.database
      .select()
      .from(messages)
      .where(eq(messages.conversationId, id))
      .orderBy(asc(messages.createdAt), asc(messages.id));

    return { ...conversation, messages: conversationMessages };
  }

  async deleteConversation(id: string): Promise<boolean> {
    await this.ensureLocalUser();
    const deleted = await this.database
      .delete(conversations)
      .where(
        and(
          eq(conversations.id, id),
          eq(conversations.userId, LOCAL_USER_ID),
        ),
      )
      .returning({ id: conversations.id });
    return deleted.length > 0;
  }

  async appendMessage(
    conversationId: string,
    input: AppendMessageInput,
  ): Promise<{ conversation: ConversationSummary; message: MessageRecord }> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);

      if (!conversation) {
        throw new RepositoryError(
          "CONVERSATION_NOT_FOUND",
          "Conversation was not found.",
        );
      }

      if (input.parentMessageId) {
        const [parent] = await transaction
          .select({ conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.id, input.parentMessageId))
          .limit(1);

        if (!parent) {
          throw new RepositoryError(
            "MESSAGE_NOT_FOUND",
            "Parent message was not found.",
          );
        }
        if (parent.conversationId !== conversationId) {
          throw new RepositoryError(
            "INVALID_MESSAGE_PARENT",
            "Parent message belongs to another conversation.",
          );
        }
      }

      const [message] = await transaction
        .insert(messages)
        .values({
          conversationId,
          parentMessageId: input.parentMessageId,
          role: input.role,
          content: input.content,
          status: input.status,
          model: input.model,
          citations: input.citations,
        })
        .returning();

      const [updated] = await transaction
        .update(conversations)
        .set({
          activeLeafMessageId: message.id,
          updatedAt: new Date(),
          version: sql`${conversations.version} + 1`,
        })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.version, conversation.version),
          ),
        )
        .returning();

      if (!updated) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation changed while the message was being appended.",
        );
      }

      return { conversation: updated, message };
    });
  }

  async setActiveLeaf(
    conversationId: string,
    messageId: string | null,
    expectedVersion: number,
  ): Promise<ConversationSummary> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, LOCAL_USER_ID),
          ),
        )
        .for("update")
        .limit(1);

      if (!conversation) {
        throw new RepositoryError(
          "CONVERSATION_NOT_FOUND",
          "Conversation was not found.",
        );
      }
      if (conversation.version !== expectedVersion) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation version does not match.",
        );
      }

      if (messageId) {
        const [leaf] = await transaction
          .select({ conversationId: messages.conversationId })
          .from(messages)
          .where(eq(messages.id, messageId))
          .limit(1);

        if (!leaf) {
          throw new RepositoryError(
            "MESSAGE_NOT_FOUND",
            "Active leaf message was not found.",
          );
        }
        if (leaf.conversationId !== conversationId) {
          throw new RepositoryError(
            "INVALID_MESSAGE_PARENT",
            "Active leaf belongs to another conversation.",
          );
        }

        const [child] = await transaction
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.parentMessageId, messageId))
          .limit(1);
        if (child) {
          throw new RepositoryError(
            "INVALID_ACTIVE_LEAF",
            "Selected message has descendants and is not a leaf.",
          );
        }
      } else {
        const [existingMessage] = await transaction
          .select({ id: messages.id })
          .from(messages)
          .where(eq(messages.conversationId, conversationId))
          .limit(1);
        if (existingMessage) {
          throw new RepositoryError(
            "INVALID_ACTIVE_LEAF",
            "A non-empty conversation must select a leaf message.",
          );
        }
      }

      const [updated] = await transaction
        .update(conversations)
        .set({
          activeLeafMessageId: messageId,
          updatedAt: new Date(),
          version: sql`${conversations.version} + 1`,
        })
        .where(
          and(
            eq(conversations.id, conversationId),
            eq(conversations.userId, LOCAL_USER_ID),
            eq(conversations.version, expectedVersion),
          ),
        )
        .returning();

      if (!updated) {
        throw new RepositoryError(
          "VERSION_CONFLICT",
          "Conversation changed while the active branch was being selected.",
        );
      }

      return updated;
    });
  }
}

export function createConversationRepository<
  TQueryResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TQueryResult, typeof schema>,
): ConversationRepository<TQueryResult> {
  return new ConversationRepository(database);
}
