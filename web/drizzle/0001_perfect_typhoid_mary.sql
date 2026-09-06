CREATE TABLE "conversation_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conversation_imports" ADD CONSTRAINT "conversation_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_imports" ADD CONSTRAINT "conversation_imports_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "conversation_imports_source_unique" ON "conversation_imports" USING btree ("user_id","source","source_id");--> statement-breakpoint
CREATE INDEX "conversation_imports_conversation_idx" ON "conversation_imports" USING btree ("conversation_id");