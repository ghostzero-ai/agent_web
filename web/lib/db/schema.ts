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

export type UserRecord = typeof users.$inferSelect;
export type ConversationRecord = typeof conversations.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
export type ConversationImportRecord = typeof conversationImports.$inferSelect;
