DROP TABLE IF EXISTS "proactivity_ledger";
--> statement-breakpoint
DROP TABLE IF EXISTS "proactivity_preferences";
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT IF EXISTS "inbox_items_proactivity_metadata_supported";
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT IF EXISTS "inbox_items_source_supported";
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP COLUMN IF EXISTS "proactivity_rationale";
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP COLUMN IF EXISTS "proactivity_reason";
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question'));
