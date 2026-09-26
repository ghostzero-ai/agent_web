ALTER TABLE "inbox_items" DROP CONSTRAINT IF EXISTS "inbox_items_briefing_sources_supported";--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT IF EXISTS "inbox_items_feedback_supported";--> statement-breakpoint
ALTER TABLE "inbox_items" DROP COLUMN IF EXISTS "feedback";--> statement-breakpoint
ALTER TABLE "inbox_items" DROP COLUMN IF EXISTS "briefing_sources";
