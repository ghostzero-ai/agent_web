CREATE TABLE "plugin_installations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plugin_id" text NOT NULL,
	"installed_version" text NOT NULL,
	"status" text DEFAULT 'disabled' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plugin_installations_plugin_id_nonempty" CHECK (length(btrim("plugin_installations"."plugin_id")) BETWEEN 3 AND 100),
	CONSTRAINT "plugin_installations_version_nonempty" CHECK (length(btrim("plugin_installations"."installed_version")) BETWEEN 5 AND 40),
	CONSTRAINT "plugin_installations_status_supported" CHECK ("plugin_installations"."status" IN ('enabled', 'disabled', 'incompatible')),
	CONSTRAINT "plugin_installations_version_positive" CHECK ("plugin_installations"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "plugin_installations" ADD CONSTRAINT "plugin_installations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "plugin_installations_user_plugin_unique" ON "plugin_installations" USING btree ("user_id", "plugin_id");
--> statement-breakpoint
CREATE INDEX "plugin_installations_user_status_idx" ON "plugin_installations" USING btree ("user_id", "status");
