CREATE TABLE "reflection_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"avoid_topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"style" text DEFAULT 'balanced' NOT NULL,
	"max_questions" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reflection_preferences_style_supported" CHECK ("reflection_preferences"."style" IN ('gentle', 'balanced', 'challenging')),
	CONSTRAINT "reflection_preferences_max_questions_range" CHECK ("reflection_preferences"."max_questions" BETWEEN 1 AND 3),
	CONSTRAINT "reflection_preferences_version_positive" CHECK ("reflection_preferences"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_source_supported";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_kind_supported";--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "reflection_questions" jsonb;--> statement-breakpoint
ALTER TABLE "reflection_preferences" ADD CONSTRAINT "reflection_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_reflection_questions_supported" CHECK ("inbox_items"."reflection_questions" IS NULL OR "inbox_items"."source" IN ('personal_briefing', 'reflection_question'));--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question'));--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_kind_supported" CHECK ("scheduled_tasks"."kind" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question'));