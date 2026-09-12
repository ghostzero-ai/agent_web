ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_source_reminder";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_kind_reminder";--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt'));--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_kind_supported" CHECK ("scheduled_tasks"."kind" IN ('reminder', 'agent_prompt'));--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_agent_prompt_required" CHECK ("scheduled_tasks"."kind" <> 'agent_prompt' OR coalesce(length(btrim("scheduled_tasks"."prompt")), 0) > 0);
