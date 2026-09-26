import { and, eq } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  conversations,
  messages,
  promptRuns,
  type PromptRunRecord,
} from "@/lib/db/schema";
import * as schema from "@/lib/db/schema";
import type { PromptEnvelope } from "@/lib/ai/promptEnvelope";
import { LOCAL_USER_ID } from "@/lib/repositories/conversationRepository";

export class PromptRunRepositoryError extends Error {
  constructor(
    readonly code: "CONVERSATION_NOT_FOUND" | "PROMPT_CONTEXT_CONFLICT",
    message: string,
  ) {
    super(message);
    this.name = "PromptRunRepositoryError";
  }
}

export type FinalPromptRunStatus = "completed" | "failed" | "cancelled";

export interface PromptRunRepositoryPort {
  start(envelope: PromptEnvelope): Promise<PromptRunRecord>;
  finish(
    id: string,
    status: FinalPromptRunStatus,
    errorCode?: string | null,
  ): Promise<PromptRunRecord | null>;
  get(id: string): Promise<PromptRunRecord | null>;
}

export class PromptRunRepository<
  TQueryResult extends PgQueryResultHKT,
> implements PromptRunRepositoryPort {
  constructor(
    private readonly database: PgDatabase<TQueryResult, typeof schema>,
  ) {}

  start(envelope: PromptEnvelope): Promise<PromptRunRecord> {
    return this.database.transaction(async (transaction) => {
      const [conversation] = await transaction
        .select({ activeLeafMessageId: conversations.activeLeafMessageId })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, envelope.conversation.id),
            eq(conversations.userId, LOCAL_USER_ID),
          ),
        )
        .for("share")
        .limit(1);
      if (!conversation) {
        throw new PromptRunRepositoryError(
          "CONVERSATION_NOT_FOUND",
          "Conversation was not found.",
        );
      }
      if (
        envelope.trigger === "send" &&
        conversation.activeLeafMessageId !== envelope.conversation.activeLeafId
      ) {
        throw new PromptRunRepositoryError(
          "PROMPT_CONTEXT_CONFLICT",
          "Conversation branch changed before the model run was recorded.",
        );
      }
      if (envelope.trigger === "retry") {
        const activeLeafId = envelope.conversation.activeLeafId;
        const [branchMessage] = activeLeafId
          ? await transaction
              .select({ id: messages.id })
              .from(messages)
              .where(
                and(
                  eq(messages.id, activeLeafId),
                  eq(messages.conversationId, envelope.conversation.id),
                ),
              )
              .limit(1)
          : [];
        if (!branchMessage) {
          throw new PromptRunRepositoryError(
            "PROMPT_CONTEXT_CONFLICT",
            "Retry branch was not found in the conversation.",
          );
        }
      }

      const [run] = await transaction
        .insert(promptRuns)
        .values({
          id: envelope.runId,
          userId: LOCAL_USER_ID,
          conversationId: envelope.conversation.id,
          activeLeafMessageId: envelope.conversation.activeLeafId,
          trigger: envelope.trigger,
          envelopeSchemaVersion: envelope.schemaVersion,
          composerVersion: envelope.composer.version,
          contentHash: envelope.integrity.contentHash,
          provider: envelope.provider.provider,
          baseUrl: envelope.provider.baseUrl,
          model: envelope.provider.model,
          messageCount: envelope.request.messages.length,
          containsMemory: envelope.privacy.containsMemory,
          status: "started",
          createdAt: new Date(envelope.createdAt),
        })
        .returning();
      return run;
    });
  }

  async finish(
    id: string,
    status: FinalPromptRunStatus,
    errorCode: string | null = null,
  ): Promise<PromptRunRecord | null> {
    const [run] = await this.database
      .update(promptRuns)
      .set({ status, errorCode, completedAt: new Date() })
      .where(
        and(
          eq(promptRuns.id, id),
          eq(promptRuns.userId, LOCAL_USER_ID),
          eq(promptRuns.status, "started"),
        ),
      )
      .returning();
    return run ?? null;
  }

  async get(id: string): Promise<PromptRunRecord | null> {
    const [run] = await this.database
      .select()
      .from(promptRuns)
      .where(and(eq(promptRuns.id, id), eq(promptRuns.userId, LOCAL_USER_ID)))
      .limit(1);
    return run ?? null;
  }
}

export function createPromptRunRepository<
  TQueryResult extends PgQueryResultHKT,
>(
  database: PgDatabase<TQueryResult, typeof schema>,
): PromptRunRepository<TQueryResult> {
  return new PromptRunRepository(database);
}
