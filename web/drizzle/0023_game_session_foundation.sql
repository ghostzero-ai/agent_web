CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'setup' NOT NULL,
	"world_name" text NOT NULL,
	"world_premise" text NOT NULL,
	"world_tone" text NOT NULL,
	"world_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"safety_boundaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_sessions_kind_supported" CHECK ("kind" IN ('roleplay', 'tabletop', 'interactive-story')),
	CONSTRAINT "game_sessions_status_supported" CHECK ("status" IN ('setup', 'active', 'paused', 'archived')),
	CONSTRAINT "game_sessions_title_length" CHECK (length(btrim("title")) BETWEEN 1 AND 120),
	CONSTRAINT "game_sessions_world_name_length" CHECK (length(btrim("world_name")) BETWEEN 1 AND 120),
	CONSTRAINT "game_sessions_world_premise_length" CHECK (length(btrim("world_premise")) BETWEEN 1 AND 4000),
	CONSTRAINT "game_sessions_world_tone_length" CHECK (length(btrim("world_tone")) BETWEEN 1 AND 500),
	CONSTRAINT "game_sessions_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "game_characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"controller" text NOT NULL,
	"description" text NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"boundaries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_characters_name_length" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "game_characters_role_length" CHECK (length(btrim("role")) BETWEEN 1 AND 120),
	CONSTRAINT "game_characters_controller_supported" CHECK ("controller" IN ('user', 'ai', 'shared')),
	CONSTRAINT "game_characters_description_length" CHECK (length(btrim("description")) BETWEEN 1 AND 2000),
	CONSTRAINT "game_characters_personality_length" CHECK (length("personality") <= 1200),
	CONSTRAINT "game_characters_version_positive" CHECK ("version" > 0)
);
--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_characters" ADD CONSTRAINT "game_characters_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_sessions_user_updated_idx" ON "game_sessions" USING btree ("user_id", "updated_at");
--> statement-breakpoint
CREATE INDEX "game_characters_session_created_idx" ON "game_characters" USING btree ("session_id", "created_at");
