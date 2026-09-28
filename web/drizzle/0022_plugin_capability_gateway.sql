CREATE TABLE "plugin_capability_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"plugin_version" text NOT NULL,
	"status" text DEFAULT 'revoked' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_capability_grants_capability_supported" CHECK ("capability_id" IN ('model.generate', 'storage.read-write', 'task.create-draft')),
	CONSTRAINT "plugin_capability_grants_plugin_version_nonempty" CHECK (length(btrim("plugin_version")) BETWEEN 5 AND 40),
	CONSTRAINT "plugin_capability_grants_status_supported" CHECK ("status" IN ('granted', 'revoked')),
	CONSTRAINT "plugin_capability_grants_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "plugin_storage_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"byte_size" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_storage_entries_key_valid" CHECK (length("key") BETWEEN 1 AND 120 AND "key" ~ '^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$'),
	CONSTRAINT "plugin_storage_entries_byte_size_range" CHECK ("byte_size" BETWEEN 1 AND 65536),
	CONSTRAINT "plugin_storage_entries_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "plugin_quota_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"used_units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_quota_usage_capability_supported" CHECK ("capability_id" IN ('model.generate', 'storage.read-write', 'task.create-draft')),
	CONSTRAINT "plugin_quota_usage_used_nonnegative" CHECK ("used_units" >= 0)
);
--> statement-breakpoint
CREATE TABLE "plugin_capability_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"operation" text NOT NULL,
	"execution" text NOT NULL,
	"run_id" text,
	"outcome" text NOT NULL,
	"error_code" text,
	"units" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "plugin_capability_audit_capability_supported" CHECK ("capability_id" IN ('model.generate', 'storage.read-write', 'task.create-draft')),
	CONSTRAINT "plugin_capability_audit_operation_nonempty" CHECK (length(btrim("operation")) BETWEEN 1 AND 80),
	CONSTRAINT "plugin_capability_audit_execution_supported" CHECK ("execution" IN ('foreground', 'background', 'authorization')),
	CONSTRAINT "plugin_capability_audit_outcome_supported" CHECK ("outcome" IN ('started', 'succeeded', 'denied', 'failed')),
	CONSTRAINT "plugin_capability_audit_units_nonnegative" CHECK ("units" >= 0),
	CONSTRAINT "plugin_capability_audit_duration_nonnegative" CHECK ("duration_ms" IS NULL OR "duration_ms" >= 0),
	CONSTRAINT "plugin_capability_audit_completion_state" CHECK (("outcome" = 'started' AND "completed_at" IS NULL) OR ("outcome" <> 'started' AND "completed_at" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "plugin_capability_grants" ADD CONSTRAINT "plugin_capability_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plugin_capability_grants" ADD CONSTRAINT "plugin_capability_grants_installation_fk" FOREIGN KEY ("user_id", "plugin_id") REFERENCES "public"."plugin_installations"("user_id", "plugin_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plugin_storage_entries" ADD CONSTRAINT "plugin_storage_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plugin_storage_entries" ADD CONSTRAINT "plugin_storage_entries_installation_fk" FOREIGN KEY ("user_id", "plugin_id") REFERENCES "public"."plugin_installations"("user_id", "plugin_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plugin_quota_usage" ADD CONSTRAINT "plugin_quota_usage_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plugin_quota_usage" ADD CONSTRAINT "plugin_quota_usage_installation_fk" FOREIGN KEY ("user_id", "plugin_id") REFERENCES "public"."plugin_installations"("user_id", "plugin_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "plugin_capability_audit" ADD CONSTRAINT "plugin_capability_audit_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_capability_grants_user_plugin_capability_unique" ON "plugin_capability_grants" USING btree ("user_id", "plugin_id", "capability_id");
--> statement-breakpoint
CREATE INDEX "plugin_capability_grants_user_plugin_idx" ON "plugin_capability_grants" USING btree ("user_id", "plugin_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_storage_entries_user_plugin_key_unique" ON "plugin_storage_entries" USING btree ("user_id", "plugin_id", "key");
--> statement-breakpoint
CREATE INDEX "plugin_storage_entries_user_plugin_updated_idx" ON "plugin_storage_entries" USING btree ("user_id", "plugin_id", "updated_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_quota_usage_scope_period_unique" ON "plugin_quota_usage" USING btree ("user_id", "plugin_id", "capability_id", "period_start");
--> statement-breakpoint
CREATE INDEX "plugin_quota_usage_user_period_idx" ON "plugin_quota_usage" USING btree ("user_id", "period_start");
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_capability_audit_request_unique" ON "plugin_capability_audit" USING btree ("request_id");
--> statement-breakpoint
CREATE INDEX "plugin_capability_audit_user_plugin_created_idx" ON "plugin_capability_audit" USING btree ("user_id", "plugin_id", "created_at");
