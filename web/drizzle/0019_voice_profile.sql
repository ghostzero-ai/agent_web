CREATE TABLE "voice_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"provider" text DEFAULT 'system' NOT NULL,
	"voice_id" text,
	"language" text DEFAULT 'zh-CN' NOT NULL,
	"rate" integer DEFAULT 100 NOT NULL,
	"pitch" integer DEFAULT 100 NOT NULL,
	"volume" integer DEFAULT 100 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_profiles_provider_supported" CHECK ("voice_profiles"."provider" = 'system'),
	CONSTRAINT "voice_profiles_voice_id_nonempty" CHECK ("voice_profiles"."voice_id" IS NULL OR length(btrim("voice_profiles"."voice_id")) > 0),
	CONSTRAINT "voice_profiles_language_nonempty" CHECK (length(btrim("voice_profiles"."language")) > 0),
	CONSTRAINT "voice_profiles_rate_range" CHECK ("voice_profiles"."rate" BETWEEN 50 AND 200),
	CONSTRAINT "voice_profiles_pitch_range" CHECK ("voice_profiles"."pitch" BETWEEN 0 AND 200),
	CONSTRAINT "voice_profiles_volume_range" CHECK ("voice_profiles"."volume" BETWEEN 0 AND 100),
	CONSTRAINT "voice_profiles_version_positive" CHECK ("voice_profiles"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "voice_profiles" ADD CONSTRAINT "voice_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
