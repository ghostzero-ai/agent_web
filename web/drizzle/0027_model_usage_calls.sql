CREATE TABLE "model_usage_calls" (
  "id" uuid PRIMARY KEY NOT NULL,
  "user_id" uuid NOT NULL,
  "started_at" timestamp with time zone NOT NULL,
  "telemetry" jsonb NOT NULL,
  CONSTRAINT "model_usage_calls_telemetry_object" CHECK (jsonb_typeof("telemetry") = 'object')
);
--> statement-breakpoint
CREATE INDEX "model_usage_calls_user_started_idx" ON "model_usage_calls" ("user_id", "started_at");
