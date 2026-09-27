CREATE TABLE "memory_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source_conversation_id" uuid,
	"source_message_id" uuid,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"evidence_quote" text NOT NULL,
	"sensitivity" text NOT NULL,
	"confidence" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"resolved_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_candidates_kind_supported" CHECK ("memory_candidates"."kind" IN ('preference', 'goal', 'profile', 'fact')),
	CONSTRAINT "memory_candidates_sensitivity_supported" CHECK ("memory_candidates"."sensitivity" IN ('low', 'personal', 'sensitive')),
	CONSTRAINT "memory_candidates_status_supported" CHECK ("memory_candidates"."status" IN ('pending', 'confirmed', 'rejected')),
	CONSTRAINT "memory_candidates_confidence_range" CHECK ("memory_candidates"."confidence" BETWEEN 0 AND 100),
	CONSTRAINT "memory_candidates_version_positive" CHECK ("memory_candidates"."version" > 0),
	CONSTRAINT "memory_candidates_resolution_state" CHECK (("memory_candidates"."status" = 'pending' AND "memory_candidates"."resolved_at" IS NULL) OR ("memory_candidates"."status" IN ('confirmed', 'rejected') AND "memory_candidates"."resolved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "memory_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source_conversation_id" uuid,
	"source_message_id" uuid,
	"kind" text NOT NULL,
	"content" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memory_items_kind_supported" CHECK ("memory_items"."kind" IN ('preference', 'goal', 'profile', 'fact')),
	CONSTRAINT "memory_items_version_positive" CHECK ("memory_items"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "memory_candidates" ADD CONSTRAINT "memory_candidates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_candidates" ADD CONSTRAINT "memory_candidates_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_candidates" ADD CONSTRAINT "memory_candidates_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_candidate_id_memory_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."memory_candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_source_conversation_id_conversations_id_fk" FOREIGN KEY ("source_conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_items" ADD CONSTRAINT "memory_items_source_message_id_messages_id_fk" FOREIGN KEY ("source_message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "memory_candidates_source_message_unique" ON "memory_candidates" USING btree ("source_message_id");--> statement-breakpoint
CREATE INDEX "memory_candidates_user_status_created_idx" ON "memory_candidates" USING btree ("user_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_items_candidate_unique" ON "memory_items" USING btree ("candidate_id");--> statement-breakpoint
CREATE INDEX "memory_items_user_created_idx" ON "memory_items" USING btree ("user_id","created_at");