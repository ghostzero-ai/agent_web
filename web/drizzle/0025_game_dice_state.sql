ALTER TABLE "game_turns" ADD COLUMN "state_patch" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "game_turns" ADD COLUMN "state_snapshot" jsonb DEFAULT '{"scene":"","objectives":[],"flags":{},"resources":{},"inventory":{}}'::jsonb NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "game_turns_id_session_unique" ON "game_turns" USING btree ("id", "session_id");
--> statement-breakpoint
CREATE TABLE "game_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"turn_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"sequence" integer NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_events_kind_supported" CHECK ("kind" = 'dice_roll'),
	CONSTRAINT "game_events_sequence_nonnegative" CHECK ("sequence" >= 0)
);
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_turn_session_fk" FOREIGN KEY ("turn_id", "session_id") REFERENCES "public"."game_turns"("id", "session_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_events_session_created_idx" ON "game_events" USING btree ("session_id", "created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "game_events_turn_sequence_unique" ON "game_events" USING btree ("turn_id", "sequence");
