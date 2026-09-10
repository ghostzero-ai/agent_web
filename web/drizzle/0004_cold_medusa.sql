CREATE TYPE "public"."inbox_item_status" AS ENUM('unread', 'read');--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"task_id" uuid,
	"task_run_id" uuid,
	"source" text DEFAULT 'reminder' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"status" "inbox_item_status" DEFAULT 'unread' NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_items_source_reminder" CHECK ("inbox_items"."source" = 'reminder'),
	CONSTRAINT "inbox_items_read_state" CHECK (("inbox_items"."status" = 'unread' AND "inbox_items"."read_at" IS NULL) OR ("inbox_items"."status" = 'read' AND "inbox_items"."read_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_task_id_scheduled_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."scheduled_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_task_run_id_task_runs_id_fk" FOREIGN KEY ("task_run_id") REFERENCES "public"."task_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "inbox_items_task_run_unique" ON "inbox_items" USING btree ("task_run_id");--> statement-breakpoint
CREATE INDEX "inbox_items_user_status_occurred_idx" ON "inbox_items" USING btree ("user_id","status","occurred_at");