CREATE TABLE "persona_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"name" text DEFAULT '知伴' NOT NULL,
	"preferred_address" text,
	"warmth" integer DEFAULT 70 NOT NULL,
	"humor" integer DEFAULT 20 NOT NULL,
	"directness" integer DEFAULT 60 NOT NULL,
	"verbosity" integer DEFAULT 50 NOT NULL,
	"initiative" integer DEFAULT 40 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "persona_profiles_name_nonempty" CHECK (length(btrim("persona_profiles"."name")) > 0),
	CONSTRAINT "persona_profiles_preferred_address_nonempty" CHECK ("persona_profiles"."preferred_address" IS NULL OR length(btrim("persona_profiles"."preferred_address")) > 0),
	CONSTRAINT "persona_profiles_warmth_range" CHECK ("persona_profiles"."warmth" BETWEEN 0 AND 100),
	CONSTRAINT "persona_profiles_humor_range" CHECK ("persona_profiles"."humor" BETWEEN 0 AND 100),
	CONSTRAINT "persona_profiles_directness_range" CHECK ("persona_profiles"."directness" BETWEEN 0 AND 100),
	CONSTRAINT "persona_profiles_verbosity_range" CHECK ("persona_profiles"."verbosity" BETWEEN 0 AND 100),
	CONSTRAINT "persona_profiles_initiative_range" CHECK ("persona_profiles"."initiative" BETWEEN 0 AND 100),
	CONSTRAINT "persona_profiles_version_positive" CHECK ("persona_profiles"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "persona_profiles" ADD CONSTRAINT "persona_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
