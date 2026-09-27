import { sql } from "drizzle-orm";
import { CORE_MODE_IDS } from "@/lib/agent/modeRegistry";
import {
  type AnyPgColumn,
  boolean,
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
import type { ResponseVerification } from "@/lib/ai/messages";

export const conversationMode = pgEnum("conversation_mode", CORE_MODE_IDS);

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

export const promptRunStatus = pgEnum("prompt_run_status", [
  "started",
  "completed",
  "failed",
  "cancelled",
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

export const inboxItemStatus = pgEnum("inbox_item_status", ["unread", "read"]);

export const pushSubscriptionStatus = pgEnum("push_subscription_status", [
  "active",
  "expired",
]);

export const notificationDeliveryStatus = pgEnum(
  "notification_delivery_status",
  ["pending", "sending", "sent", "failed", "cancelled"],
);

export type TaskScheduleValue =
  | { runAt: string }
  | { time: string }
  | { weekday: number; time: string };

export type TaskKind =
  | "reminder"
  | "agent_prompt"
  | "personal_briefing"
  | "book_recommendation"
  | "reflection_question";
export type InboxSource = TaskKind;
export type BriefingFeedback = "helpful" | "not_relevant" | "duplicate";
export type ReadingDifficulty = "introductory" | "intermediate" | "advanced";
export type ReadingGoal = "beginner" | "systematic" | "broaden" | "literary";
export type ReflectionStyle = "gentle" | "balanced" | "challenging";
export type ReflectionQuestionType =
  | "assumption"
  | "evidence"
  | "tradeoff"
  | "alternative"
  | "future"
  | "action";
export type MemoryCandidateKind = "preference" | "goal" | "profile" | "fact";
export type MemoryCandidateStatus = "pending" | "confirmed" | "rejected";
export type MemorySensitivity = "low" | "personal" | "sensitive";

export type ReflectionQuestionSignal = {
  question: string;
  type: ReflectionQuestionType;
  why: string;
  scores: {
    relevance: number;
    novelty: number;
    actionability: number;
    emotionalLoad: number;
    total: number;
  };
  candidateCount: number;
};

export type BriefingSourceSignal = {
  title: string;
  url: string;
  source: string;
  publishedAt: string | null;
  urlKey: string;
  titleKey: string;
};

export type MessageCitation = {
  id?: string;
  title: string;
  url: string;
  snippet?: string;
  source?: string;
  publishedAt?: string | null;
  fetchedAt?: string;
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

export const readingProfiles = pgTable(
  "reading_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    topics: jsonb("topics").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    readBooks: jsonb("read_books").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    wantToReadBooks: jsonb("want_to_read_books")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    dislikedBooks: jsonb("disliked_books")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    difficulty: text("difficulty")
      .$type<ReadingDifficulty>()
      .notNull()
      .default("intermediate"),
    weeklyMinutes: integer("weekly_minutes").notNull().default(120),
    goal: text("goal").$type<ReadingGoal>().notNull().default("systematic"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "reading_profiles_difficulty_supported",
      sql`${table.difficulty} IN ('introductory', 'intermediate', 'advanced')`,
    ),
    check(
      "reading_profiles_goal_supported",
      sql`${table.goal} IN ('beginner', 'systematic', 'broaden', 'literary')`,
    ),
    check(
      "reading_profiles_weekly_minutes_range",
      sql`${table.weeklyMinutes} BETWEEN 15 AND 10080`,
    ),
    check("reading_profiles_version_positive", sql`${table.version} > 0`),
  ],
);

export const personaProfiles = pgTable(
  "persona_profiles",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("知伴"),
    preferredAddress: text("preferred_address"),
    warmth: integer("warmth").notNull().default(70),
    humor: integer("humor").notNull().default(20),
    directness: integer("directness").notNull().default(60),
    verbosity: integer("verbosity").notNull().default(50),
    initiative: integer("initiative").notNull().default(40),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check("persona_profiles_name_nonempty", sql`length(btrim(${table.name})) > 0`),
    check(
      "persona_profiles_preferred_address_nonempty",
      sql`${table.preferredAddress} IS NULL OR length(btrim(${table.preferredAddress})) > 0`,
    ),
    check("persona_profiles_warmth_range", sql`${table.warmth} BETWEEN 0 AND 100`),
    check("persona_profiles_humor_range", sql`${table.humor} BETWEEN 0 AND 100`),
    check("persona_profiles_directness_range", sql`${table.directness} BETWEEN 0 AND 100`),
    check("persona_profiles_verbosity_range", sql`${table.verbosity} BETWEEN 0 AND 100`),
    check("persona_profiles_initiative_range", sql`${table.initiative} BETWEEN 0 AND 100`),
    check("persona_profiles_version_positive", sql`${table.version} > 0`),
  ],
);

export const reflectionPreferences = pgTable(
  "reflection_preferences",
  {
    userId: uuid("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").notNull().default(true),
    goals: jsonb("goals").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    avoidTopics: jsonb("avoid_topics")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    style: text("style")
      .$type<ReflectionStyle>()
      .notNull()
      .default("balanced"),
    maxQuestions: integer("max_questions").notNull().default(1),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "reflection_preferences_style_supported",
      sql`${table.style} IN ('gentle', 'balanced', 'challenging')`,
    ),
    check(
      "reflection_preferences_max_questions_range",
      sql`${table.maxQuestions} BETWEEN 1 AND 3`,
    ),
    check("reflection_preferences_version_positive", sql`${table.version} > 0`),
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
    verification: jsonb("verification").$type<ResponseVerification | null>(),
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

export const memoryCandidates = pgTable(
  "memory_candidates",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<MemoryCandidateKind>().notNull(),
    content: text("content").notNull(),
    evidenceQuote: text("evidence_quote").notNull(),
    sensitivity: text("sensitivity").$type<MemorySensitivity>().notNull(),
    confidence: integer("confidence").notNull(),
    reason: text("reason").notNull(),
    status: text("status")
      .$type<MemoryCandidateStatus>()
      .notNull()
      .default("pending"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true, mode: "date" }),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_candidates_source_message_unique").on(
      table.sourceMessageId,
    ),
    index("memory_candidates_user_status_created_idx").on(
      table.userId,
      table.status,
      table.createdAt,
    ),
    check(
      "memory_candidates_kind_supported",
      sql`${table.kind} IN ('preference', 'goal', 'profile', 'fact')`,
    ),
    check(
      "memory_candidates_sensitivity_supported",
      sql`${table.sensitivity} IN ('low', 'personal', 'sensitive')`,
    ),
    check(
      "memory_candidates_status_supported",
      sql`${table.status} IN ('pending', 'confirmed', 'rejected')`,
    ),
    check(
      "memory_candidates_confidence_range",
      sql`${table.confidence} BETWEEN 0 AND 100`,
    ),
    check("memory_candidates_version_positive", sql`${table.version} > 0`),
    check(
      "memory_candidates_resolution_state",
      sql`(${table.status} = 'pending' AND ${table.resolvedAt} IS NULL) OR (${table.status} IN ('confirmed', 'rejected') AND ${table.resolvedAt} IS NOT NULL)`,
    ),
  ],
);

export const memoryItems = pgTable(
  "memory_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    candidateId: uuid("candidate_id")
      .notNull()
      .references(() => memoryCandidates.id, { onDelete: "restrict" }),
    sourceConversationId: uuid("source_conversation_id").references(
      () => conversations.id,
      { onDelete: "set null" },
    ),
    sourceMessageId: uuid("source_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    kind: text("kind").$type<MemoryCandidateKind>().notNull(),
    content: text("content").notNull(),
    sensitivity: text("sensitivity")
      .$type<MemorySensitivity>()
      .notNull()
      .default("low"),
    pinned: boolean("pinned").notNull().default(false),
    validUntil: timestamp("valid_until", { withTimezone: true, mode: "date" }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    useCount: integer("use_count").notNull().default(0),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_items_candidate_unique").on(table.candidateId),
    index("memory_items_user_created_idx").on(table.userId, table.createdAt),
    index("memory_items_user_pinned_updated_idx").on(
      table.userId,
      table.pinned,
      table.updatedAt,
    ),
    check(
      "memory_items_kind_supported",
      sql`${table.kind} IN ('preference', 'goal', 'profile', 'fact')`,
    ),
    check(
      "memory_items_sensitivity_supported",
      sql`${table.sensitivity} IN ('low', 'personal', 'sensitive')`,
    ),
    check("memory_items_content_nonempty", sql`length(btrim(${table.content})) > 0`),
    check("memory_items_use_count_nonnegative", sql`${table.useCount} >= 0`),
    check("memory_items_version_positive", sql`${table.version} > 0`),
  ],
);

export const promptRuns = pgTable(
  "prompt_runs",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    activeLeafMessageId: uuid("active_leaf_message_id"),
    trigger: text("trigger").notNull(),
    envelopeSchemaVersion: integer("envelope_schema_version").notNull(),
    composerVersion: text("composer_version").notNull(),
    contentHash: text("content_hash").notNull(),
    provider: text("provider").notNull(),
    baseUrl: text("base_url").notNull(),
    model: text("model").notNull(),
    messageCount: integer("message_count").notNull(),
    containsMemory: boolean("contains_memory").notNull().default(false),
    status: promptRunStatus("status").notNull().default("started"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    index("prompt_runs_conversation_created_idx").on(
      table.conversationId,
      table.createdAt,
    ),
    check("prompt_runs_trigger_supported", sql`${table.trigger} IN ('send', 'retry')`),
    check("prompt_runs_schema_version_positive", sql`${table.envelopeSchemaVersion} > 0`),
    check("prompt_runs_message_count_positive", sql`${table.messageCount} > 0`),
    check("prompt_runs_content_hash_sha256", sql`${table.contentHash} ~ '^[0-9a-f]{64}$'`),
  ],
);

export const memoryUsages = pgTable(
  "memory_usages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    memoryItemId: uuid("memory_item_id").notNull(),
    promptRunId: uuid("prompt_run_id")
      .notNull()
      .references(() => promptRuns.id, { onDelete: "cascade" }),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    queryMessageId: uuid("query_message_id").references(() => messages.id, {
      onDelete: "set null",
    }),
    rank: integer("rank").notNull(),
    score: integer("score").notNull(),
    estimatedTokens: integer("estimated_tokens").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("memory_usages_run_item_unique").on(
      table.promptRunId,
      table.memoryItemId,
    ),
    index("memory_usages_item_created_idx").on(
      table.memoryItemId,
      table.createdAt,
    ),
    check("memory_usages_rank_positive", sql`${table.rank} > 0`),
    check("memory_usages_score_positive", sql`${table.score} > 0`),
    check(
      "memory_usages_tokens_positive",
      sql`${table.estimatedTokens} > 0`,
    ),
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
    uniqueIndex("model_credentials_user_unique").on(table.userId),
    check(
      "model_credentials_provider_nonempty",
      sql`length(btrim(${table.provider})) > 0`,
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
    kind: text("kind").$type<TaskKind>().notNull().default("reminder"),
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
    check(
      "scheduled_tasks_kind_supported",
      sql`${table.kind} IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question')`,
    ),
    check(
      "scheduled_tasks_generated_prompt_required",
      sql`${table.kind} = 'reminder' OR coalesce(length(btrim(${table.prompt})), 0) > 0`,
    ),
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

export const inboxItems = pgTable(
  "inbox_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => scheduledTasks.id, {
      onDelete: "set null",
    }),
    taskRunId: uuid("task_run_id").references(() => taskRuns.id, {
      onDelete: "set null",
    }),
    source: text("source").$type<InboxSource>().notNull().default("reminder"),
    title: text("title").notNull(),
    body: text("body"),
    briefingSources: jsonb("briefing_sources").$type<BriefingSourceSignal[]>(),
    reflectionQuestions: jsonb("reflection_questions")
      .$type<ReflectionQuestionSignal[]>(),
    feedback: text("feedback").$type<BriefingFeedback>(),
    occurredAt: timestamp("occurred_at", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    status: inboxItemStatus("status").notNull().default("unread"),
    readAt: timestamp("read_at", { withTimezone: true, mode: "date" }),
    pushPlannedAt: timestamp("push_planned_at", {
      withTimezone: true,
      mode: "date",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("inbox_items_task_run_unique").on(table.taskRunId),
    index("inbox_items_user_status_occurred_idx").on(
      table.userId,
      table.status,
      table.occurredAt,
    ),
    check(
      "inbox_items_source_supported",
      sql`${table.source} IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question')`,
    ),
    check(
      "inbox_items_feedback_supported",
      sql`${table.feedback} IS NULL OR (${table.source} = 'personal_briefing' AND ${table.feedback} IN ('helpful', 'not_relevant', 'duplicate'))`,
    ),
    check(
      "inbox_items_briefing_sources_supported",
      sql`${table.briefingSources} IS NULL OR ${table.source} = 'personal_briefing'`,
    ),
    check(
      "inbox_items_reflection_questions_supported",
      sql`${table.reflectionQuestions} IS NULL OR ${table.source} IN ('personal_briefing', 'reflection_question')`,
    ),
    check(
      "inbox_items_read_state",
      sql`(${table.status} = 'unread' AND ${table.readAt} IS NULL) OR (${table.status} = 'read' AND ${table.readAt} IS NOT NULL)`,
    ),
  ],
);

export const pushVapidConfigurations = pgTable("push_vapid_configurations", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  publicKey: text("public_key").notNull(),
  encryptedPrivateKey: text("encrypted_private_key").notNull(),
  subject: text("subject").notNull(),
  encryptionKeyVersion: integer("encryption_key_version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  check(
    "push_vapid_configurations_key_version_positive",
    sql`${table.encryptionKeyVersion} > 0`,
  ),
]);

export const notificationPreferences = pgTable("notification_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  pushEnabled: boolean("push_enabled").notNull().default(false),
  quietHoursEnabled: boolean("quiet_hours_enabled").notNull().default(true),
  quietStart: text("quiet_start").notNull().default("22:00"),
  quietEnd: text("quiet_end").notNull().default("08:00"),
  timezone: text("timezone").notNull().default("Asia/Shanghai"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  check(
    "notification_preferences_quiet_start_time",
    sql`${table.quietStart} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
  ),
  check(
    "notification_preferences_quiet_end_time",
    sql`${table.quietEnd} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
  ),
  check(
    "notification_preferences_timezone_shanghai",
    sql`${table.timezone} = 'Asia/Shanghai'`,
  ),
  check("notification_preferences_version_positive", sql`${table.version} > 0`),
]);

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull().default("web-push"),
  endpointHash: text("endpoint_hash").notNull(),
  encryptedSubscription: text("encrypted_subscription").notNull(),
  deviceLabel: text("device_label").notNull(),
  status: pushSubscriptionStatus("status").notNull().default("active"),
  failureCount: integer("failure_count").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true, mode: "date" }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true, mode: "date" }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("push_subscriptions_user_endpoint_unique").on(
    table.userId,
    table.endpointHash,
  ),
  index("push_subscriptions_user_status_idx").on(table.userId, table.status),
  check("push_subscriptions_failure_count_nonnegative", sql`${table.failureCount} >= 0`),
]);

export const notificationDeliveries = pgTable("notification_deliveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inboxItemId: uuid("inbox_item_id")
    .notNull()
    .references(() => inboxItems.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id")
    .notNull()
    .references(() => pushSubscriptions.id, { onDelete: "cascade" }),
  status: notificationDeliveryStatus("status").notNull().default("pending"),
  availableAt: timestamp("available_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  attempt: integer("attempt").notNull().default(0),
  claimedBy: text("claimed_by"),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true, mode: "date" }),
  lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true, mode: "date" }),
  sentAt: timestamp("sent_at", { withTimezone: true, mode: "date" }),
  errorCode: text("error_code"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
    .notNull()
    .defaultNow(),
}, (table) => [
  uniqueIndex("notification_deliveries_inbox_subscription_unique").on(
    table.inboxItemId,
    table.subscriptionId,
  ),
  index("notification_deliveries_status_available_idx").on(
    table.status,
    table.availableAt,
  ),
  check("notification_deliveries_attempt_nonnegative", sql`${table.attempt} >= 0`),
]);

export type UserRecord = typeof users.$inferSelect;
export type ReadingProfileRecord = typeof readingProfiles.$inferSelect;
export type PersonaProfileRecord = typeof personaProfiles.$inferSelect;
export type ReflectionPreferenceRecord = typeof reflectionPreferences.$inferSelect;
export type ConversationRecord = typeof conversations.$inferSelect;
export type MessageRecord = typeof messages.$inferSelect;
export type MemoryCandidateRecord = typeof memoryCandidates.$inferSelect;
export type MemoryItemRecord = typeof memoryItems.$inferSelect;
export type MemoryUsageRecord = typeof memoryUsages.$inferSelect;
export type PromptRunRecord = typeof promptRuns.$inferSelect;
export type ConversationImportRecord = typeof conversationImports.$inferSelect;
export type ModelCredentialRecord = typeof modelCredentials.$inferSelect;
export type ScheduledTaskRecord = typeof scheduledTasks.$inferSelect;
export type TaskRunRecord = typeof taskRuns.$inferSelect;
export type InboxItemRecord = typeof inboxItems.$inferSelect;
export type PushVapidConfigurationRecord = typeof pushVapidConfigurations.$inferSelect;
export type NotificationPreferenceRecord = typeof notificationPreferences.$inferSelect;
export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;
export type NotificationDeliveryRecord = typeof notificationDeliveries.$inferSelect;
