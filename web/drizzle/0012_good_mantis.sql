ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_source_supported";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_agent_prompt_required";--> statement-breakpoint
ALTER TABLE "scheduled_tasks" DROP CONSTRAINT "scheduled_tasks_kind_supported";--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt', 'personal_briefing'));--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_generated_prompt_required" CHECK ("scheduled_tasks"."kind" = 'reminder' OR coalesce(length(btrim("scheduled_tasks"."prompt")), 0) > 0);--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_kind_supported" CHECK ("scheduled_tasks"."kind" IN ('reminder', 'agent_prompt', 'personal_briefing'));