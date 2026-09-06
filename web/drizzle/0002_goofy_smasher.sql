CREATE TABLE "model_credentials" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"base_url" text NOT NULL,
	"model" text NOT NULL,
	"encrypted_api_key" text NOT NULL,
	"api_key_hint" text NOT NULL,
	"encryption_key_version" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "model_credentials_encryption_key_version_positive" CHECK ("model_credentials"."encryption_key_version" > 0),
	CONSTRAINT "model_credentials_version_positive" CHECK ("model_credentials"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "model_credentials" ADD CONSTRAINT "model_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_credentials_user_provider_unique" ON "model_credentials" USING btree ("user_id","provider");