import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const conversationMode = pgEnum("conversation_mode", [
  "auto",
  "professional",
  "companion",
  "reflection",
]);

export const messageRole = pgEnum("message_role", [
  "system",
  "developer",
  "user",
  "assistant",
  "tool",
]);

export const messageStatus = pgEnum("message_status", [
  "pending",
  "streaming",
  "complete",
  "failed",
]);

export const taskScheduleType = pgEnum("task_schedule_type", [
  "once",
  "daily",
  "weekly",
]);

export const taskStatus = pgEnum("task_status", [
  "active",
  "paused",
  "completed",
]);

export const taskRunStatus = pgEnum("task_run_status", [
  "queued",
  "claimed",
  "running",
  "succeeded",
  "failed",
  "skipped",
  "cancelled",
]);

export type TaskScheduleValue =
  | { runAt: string }
  | { time: string }
  | { weekday: number; time: string };

export type MessageCitation = {
  title: string;
  url: string;
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    displayName: text("display_name").notNull().default("Local User"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("users_version_positive", sql`${table.version} > 0`),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    mode: conversationMode("mode").notNull().default("auto"),
    summary: text("summary"),
    // The repository will verify that the selected leaf belongs to this
    // conversation. Keeping this FK-free avoids a conversations/messages
    // dependency cycle while the message parent relation stays enforced.
    activeLeafMessageId: uuid("active_leaf_message_id"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("conversations_user_updated_idx").on(
      table.userId,
      table.updatedAt,
    ),
    check("conversations_version_positive", sql`${table.version} > 0`),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    parentMessageId: uuid("parent_message_id").references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    role: messageRole("role").notNull(),
    content: text("content").notNull(),
    status: messageStatus("status").notNull().default("complete"),
    model: text("model"),
    citations: jsonb("citations")
      .$type<MessageCitation[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("messages_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    index("messages_parent_idx").on(table.parentMessageId),
  ],
);

export const conversationImports = pgTable(
  "conversation_imports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    sourceId: text("source_id").notNull(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    importedAt: timestamp("imported_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("conversation_imports_source_unique").on(
      table.userId,
      table.source,
      table.sourceId,
    ),
    index("conversation_imports_conversation_idx").on(table.conversationId),
  ],
);

export const modelCredentials = pgTable(
  "model_credentials",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    apiKeyHint: text("api_key_hint").notNull(),
    encryptionKeyVersion: integer("encryption_key_version")
      .notNull()
      .default(1),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("model_credentials_user_provider_unique").on(
      table.userId,
      table.provider,
    ),
    check(
      "model_credentials_encryption_key_version_positive",
      sql`${table.encryptionKeyVersion} > 0`,
    ),
    check("model_credentials_version_positive", sql`${table.version} > 0`),
  ],
);

export const scheduledTasks = pgTable(
  "scheduled_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    prompt: text("prompt"),
    kind: text("kind").notNull().default("reminder"),
    scheduleType: taskScheduleType("schedule_type").notNull(),
    scheduleValue: jsonb("schedule_value").$type<TaskScheduleValue>().notNull(),
    timezone: text("timezone").notNull().default("Asia/Shanghai"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true, mode: "date" }),
    status: taskStatus("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("scheduled_tasks_user_status_next_idx").on(
      table.userId,
      table.status,
      table.nextRunAt,
    ),
    check("scheduled_tasks_version_positive", sql`${table.version} > 0`),
    check("scheduled_tasks_kind_reminder", sql`${table.kind} = 'reminder'`),
    check(
      "scheduled_tasks_active_next_run",
      sql`${table.status} <> 'active' OR ${table.nextRunAt} IS NOT NULL`,
    ),
  ],
);

export const taskRuns = pgTable(
  "task_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => scheduledTasks.id, { onDelete: "cascade" }),
    scheduledFor: timestamp("scheduled_for", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: taskRunStatus("status").notNull().default("queued"),
    attempt: integer("attempt").notNull().default(1),
    claimedBy: text("claimed_by"),
    leaseExpiresAt: timestamp("lease_expires_at", {
      withTimezone: true,
      mode: "date",
    }),
    startedAt: timestamp("started_at", { withTimezone: true, mode: "date" }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: "date" }),
    resultSummary: text("result_summary"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    notifiedAt: timestamp("notified_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("task_runs_task_scheduled_unique").on(
      table.taskId,
      table.scheduledFor,
    ),
    index("task_runs_status_scheduled_idx").on(
      table.status,
      table.scheduledFor,
    ),
    check("task_runs_attempt_positive", sql`${table.attempt} > 0`),
  ],
);

export type UserRecord = typeof users.$inferSelect;
export type ConversationRecord = typeof conversations.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
export type ConversationImportRecord = typeof conversationImports.$inferSelect;
export type ModelCredentialRecord = typeof modelCredentials.$inferSelect;
export type ScheduledTaskRecord = typeof scheduledTasks.$inferSelect;
export type TaskRunRecord = typeof taskRuns.$inferSelect;
