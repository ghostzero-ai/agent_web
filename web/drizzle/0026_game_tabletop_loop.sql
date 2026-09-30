ALTER TABLE "game_characters" ADD COLUMN "attributes" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "game_characters" ADD COLUMN "max_health" integer DEFAULT 10 NOT NULL;
--> statement-breakpoint
ALTER TABLE "game_characters" ADD CONSTRAINT "game_characters_attributes_object" CHECK (jsonb_typeof("attributes") = 'object');
--> statement-breakpoint
ALTER TABLE "game_characters" ADD CONSTRAINT "game_characters_max_health_positive" CHECK ("max_health" BETWEEN 1 AND 1000000);
--> statement-breakpoint
ALTER TABLE "game_turns" ALTER COLUMN "state_snapshot" SET DEFAULT '{"scene":"","sceneFacts":[],"sceneExits":[],"objectives":[],"flags":{},"resources":{},"inventory":{},"characters":{},"items":{}}'::jsonb;
--> statement-breakpoint
ALTER TABLE "game_events" DROP CONSTRAINT "game_events_kind_supported";
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_kind_supported" CHECK ("kind" IN ('dice_roll', 'rule_check'));
--> statement-breakpoint
CREATE TABLE "game_checkpoints" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"name" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"state_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_checkpoints_name_length" CHECK (length(btrim("name")) BETWEEN 1 AND 120),
	CONSTRAINT "game_checkpoints_note_length" CHECK (length("note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "game_checkpoints" ADD CONSTRAINT "game_checkpoints_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_checkpoints" ADD CONSTRAINT "game_checkpoints_turn_session_fk" FOREIGN KEY ("turn_id", "session_id") REFERENCES "public"."game_turns"("id", "session_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_checkpoints_session_created_idx" ON "game_checkpoints" USING btree ("session_id", "created_at");
