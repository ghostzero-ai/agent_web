ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_reflection_questions_supported";
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_source_supported";
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_kind_supported";
--> statement-breakpoint
UPDATE "inbox_items" SET "source" = 'agent_prompt' WHERE "source" = 'reflection_question';
--> statement-breakpoint
UPDATE "scheduled_tasks" SET "kind" = 'agent_prompt' WHERE "kind" = 'reflection_question';
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation'));
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_kind_supported" CHECK ("scheduled_tasks"."kind" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation'));
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP COLUMN "reflection_questions";
--> statement-breakpoint
DROP TABLE "reflection_preferences";
