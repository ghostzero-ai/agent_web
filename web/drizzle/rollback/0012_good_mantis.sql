ALTER TABLE "scheduled_tasks" DROP CONSTRAINT IF EXISTS "scheduled_tasks_generated_prompt_required";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT IF EXISTS "scheduled_tasks_kind_supported";--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT IF EXISTS "inbox_items_source_supported";--> statement-breakpoint
UPDATE "inbox_items" SET "source" = 'agent_prompt' WHERE "source" = 'personal_briefing';--> statement-breakpoint
UPDATE "scheduled_tasks" SET "kind" = 'agent_prompt' WHERE "kind" = 'personal_briefing';--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt'));--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_agent_prompt_required" CHECK ("scheduled_tasks"."kind" <> 'agent_prompt' OR coalesce(length(btrim("scheduled_tasks"."prompt")), 0) > 0);--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_kind_supported" CHECK ("scheduled_tasks"."kind" IN ('reminder', 'agent_prompt'));
