CREATE TABLE "memory_usages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"memory_item_id" uuid NOT NULL,
	"prompt_run_id" uuid NOT NULL,
	"conversation_id" uuid,
	"query_message_id" uuid,
	"rank" integer NOT NULL,
	"score" integer NOT NULL,
	"estimated_tokens" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_usages_rank_positive" CHECK ("memory_usages"."rank" > 0),
	CONSTRAINT "memory_usages_score_positive" CHECK ("memory_usages"."score" > 0),
	CONSTRAINT "memory_usages_tokens_positive" CHECK ("memory_usages"."estimated_tokens" > 0)
);
--> statement-breakpoint
ALTER TABLE "memory_items" ADD COLUMN "sensitivity" text DEFAULT 'low' NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_items" ADD COLUMN "pinned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_items" ADD COLUMN "valid_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_items" ADD COLUMN "last_used_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memory_items" ADD COLUMN "use_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "memory_items"
SET "sensitivity" = "memory_candidates"."sensitivity"
FROM "memory_candidates"
WHERE "memory_items"."candidate_id" = "memory_candidates"."id";--> statement-breakpoint
ALTER TABLE "memory_usages" ADD CONSTRAINT "memory_usages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_usages" ADD CONSTRAINT "memory_usages_prompt_run_id_prompt_runs_id_fk" FOREIGN KEY ("prompt_run_id") REFERENCES "public"."prompt_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_usages" ADD CONSTRAINT "memory_usages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_usages" ADD CONSTRAINT "memory_usages_query_message_id_messages_id_fk" FOREIGN KEY ("query_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_usages_run_item_unique" ON "memory_usages" USING btree ("prompt_run_id","memory_item_id");--> statement-breakpoint
CREATE INDEX "memory_usages_item_created_idx" ON "memory_usages" USING btree ("memory_item_id","created_at");--> statement-breakpoint
CREATE INDEX "memory_items_user_pinned_updated_idx" ON "memory_items" USING btree ("user_id","pinned","updated_at");--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_sensitivity_supported" CHECK ("memory_items"."sensitivity" IN ('low', 'personal', 'sensitive'));--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_content_nonempty" CHECK (length(btrim("memory_items"."content")) > 0);--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_use_count_nonnegative" CHECK ("memory_items"."use_count" >= 0);
