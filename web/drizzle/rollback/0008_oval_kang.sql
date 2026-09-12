ALTER TABLE "scheduled_tasks" DROP CONSTRAINT IF EXISTS "scheduled_tasks_agent_prompt_required";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT IF EXISTS "scheduled_tasks_kind_supported";--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT IF EXISTS "inbox_items_source_supported";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_kind_reminder" CHECK ("scheduled_tasks"."kind" = 'reminder');--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_reminder" CHECK ("inbox_items"."source" = 'reminder');
