CREATE TABLE "reading_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_books" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"want_to_read_books" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"disliked_books" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"difficulty" text DEFAULT 'intermediate' NOT NULL,
	"weekly_minutes" integer DEFAULT 120 NOT NULL,
	"goal" text DEFAULT 'systematic' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_profiles_difficulty_supported" CHECK ("reading_profiles"."difficulty" IN ('introductory', 'intermediate', 'advanced')),
	CONSTRAINT "reading_profiles_goal_supported" CHECK ("reading_profiles"."goal" IN ('beginner', 'systematic', 'broaden', 'literary')),
	CONSTRAINT "reading_profiles_weekly_minutes_range" CHECK ("reading_profiles"."weekly_minutes" BETWEEN 15 AND 10080),
	CONSTRAINT "reading_profiles_version_positive" CHECK ("reading_profiles"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_source_supported";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_kind_supported";--> statement-breakpoint
ALTER TABLE "reading_profiles" ADD CONSTRAINT "reading_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation'));--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_kind_supported" CHECK ("scheduled_tasks"."kind" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation'));