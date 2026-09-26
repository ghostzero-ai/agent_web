CREATE TYPE "public"."prompt_run_status" AS ENUM('started', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TABLE "prompt_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"conversation_id" uuid NOT NULL,
	"active_leaf_message_id" uuid,
	"trigger" text NOT NULL,
	"envelope_schema_version" integer NOT NULL,
	"composer_version" text NOT NULL,
	"content_hash" text NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"message_count" integer NOT NULL,
	"contains_memory" boolean DEFAULT false NOT NULL,
	"status" "prompt_run_status" DEFAULT 'started' NOT NULL,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "prompt_runs_trigger_supported" CHECK ("prompt_runs"."trigger" IN ('send', 'retry')),
	CONSTRAINT "prompt_runs_schema_version_positive" CHECK ("prompt_runs"."envelope_schema_version" > 0),
	CONSTRAINT "prompt_runs_message_count_positive" CHECK ("prompt_runs"."message_count" > 0),
	CONSTRAINT "prompt_runs_content_hash_sha256" CHECK ("prompt_runs"."content_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prompt_runs_conversation_created_idx" ON "prompt_runs" USING btree ("conversation_id","created_at");