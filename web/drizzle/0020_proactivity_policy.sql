CREATE TABLE "proactivity_preferences" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"max_messages_per_day" integer DEFAULT 1 NOT NULL,
	"min_cooldown_hours" integer DEFAULT 72 NOT NULL,
	"checkin_after_days" integer DEFAULT 3 NOT NULL,
	"allowed_reasons" jsonb DEFAULT '["goal_followup", "checkin"]'::jsonb NOT NULL,
	"paused_until" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proactivity_preferences_daily_budget_range" CHECK ("proactivity_preferences"."max_messages_per_day" BETWEEN 1 AND 3),
	CONSTRAINT "proactivity_preferences_cooldown_range" CHECK ("proactivity_preferences"."min_cooldown_hours" BETWEEN 6 AND 168),
	CONSTRAINT "proactivity_preferences_checkin_days_range" CHECK ("proactivity_preferences"."checkin_after_days" BETWEEN 1 AND 30),
	CONSTRAINT "proactivity_preferences_allowed_reasons_array" CHECK (jsonb_typeof("proactivity_preferences"."allowed_reasons") = 'array' AND "proactivity_preferences"."allowed_reasons" <@ '["goal_followup", "checkin"]'::jsonb),
	CONSTRAINT "proactivity_preferences_version_positive" CHECK ("proactivity_preferences"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "proactivity_preferences" ADD CONSTRAINT "proactivity_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_source_supported";
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "proactivity_reason" text;
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "proactivity_rationale" text;
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_source_supported" CHECK ("inbox_items"."source" IN ('reminder', 'agent_prompt', 'personal_briefing', 'book_recommendation', 'reflection_question', 'proactive_checkin'));
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_proactivity_metadata_supported" CHECK (("inbox_items"."source" = 'proactive_checkin' AND "inbox_items"."proactivity_reason" IN ('goal_followup', 'checkin') AND coalesce(length(btrim("inbox_items"."proactivity_rationale")), 0) > 0) OR ("inbox_items"."source" <> 'proactive_checkin' AND "inbox_items"."proactivity_reason" IS NULL AND "inbox_items"."proactivity_rationale" IS NULL));
--> statement-breakpoint
CREATE TABLE "proactivity_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"inbox_item_id" uuid,
	"reason" text NOT NULL,
	"trigger_key" text NOT NULL,
	"trigger_ref_id" uuid,
	"rationale" text NOT NULL,
	"policy_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proactivity_ledger_reason_supported" CHECK ("proactivity_ledger"."reason" IN ('goal_followup', 'checkin')),
	CONSTRAINT "proactivity_ledger_trigger_key_nonempty" CHECK (length(btrim("proactivity_ledger"."trigger_key")) > 0),
	CONSTRAINT "proactivity_ledger_rationale_nonempty" CHECK (length(btrim("proactivity_ledger"."rationale")) > 0)
);
--> statement-breakpoint
ALTER TABLE "proactivity_ledger" ADD CONSTRAINT "proactivity_ledger_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "proactivity_ledger" ADD CONSTRAINT "proactivity_ledger_inbox_item_id_inbox_items_id_fk" FOREIGN KEY ("inbox_item_id") REFERENCES "public"."inbox_items"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "proactivity_ledger_user_trigger_unique" ON "proactivity_ledger" USING btree ("user_id", "trigger_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "proactivity_ledger_inbox_unique" ON "proactivity_ledger" USING btree ("inbox_item_id");
--> statement-breakpoint
CREATE INDEX "proactivity_ledger_user_created_idx" ON "proactivity_ledger" USING btree ("user_id", "created_at");
