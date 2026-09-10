CREATE TYPE "public"."task_run_status" AS ENUM('queued', 'claimed', 'running', 'succeeded', 'failed', 'skipped', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."task_schedule_type" AS ENUM('once', 'daily', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('active', 'paused', 'completed');--> statement-breakpoint
CREATE TABLE "scheduled_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"prompt" text,
	"kind" text DEFAULT 'reminder' NOT NULL,
	"schedule_type" "task_schedule_type" NOT NULL,
	"schedule_value" jsonb NOT NULL,
	"timezone" text DEFAULT 'Asia/Shanghai' NOT NULL,
	"next_run_at" timestamp with time zone,
	"status" "task_status" DEFAULT 'active' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_tasks_version_positive" CHECK ("scheduled_tasks"."version" > 0),
	CONSTRAINT "scheduled_tasks_kind_reminder" CHECK ("scheduled_tasks"."kind" = 'reminder'),
	CONSTRAINT "scheduled_tasks_active_next_run" CHECK ("scheduled_tasks"."status" <> 'active' OR "scheduled_tasks"."next_run_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" "task_run_status" DEFAULT 'queued' NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"claimed_by" text,
	"lease_expires_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"result_summary" text,
	"error_code" text,
	"error_message" text,
	"notified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_runs_attempt_positive" CHECK ("task_runs"."attempt" > 0)
);
--> statement-breakpoint
ALTER TABLE "scheduled_tasks" ADD CONSTRAINT "scheduled_tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_task_id_scheduled_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."scheduled_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_tasks_user_status_next_idx" ON "scheduled_tasks" USING btree ("user_id","status","next_run_at");--> statement-breakpoint
CREATE UNIQUE INDEX "task_runs_task_scheduled_unique" ON "task_runs" USING btree ("task_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "task_runs_status_scheduled_idx" ON "task_runs" USING btree ("status","scheduled_for");