ALTER TABLE "game_sessions" ADD COLUMN "active_leaf_turn_id" uuid;
--> statement-breakpoint
CREATE TABLE "game_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"parent_turn_id" uuid,
	"player_content" text NOT NULL,
	"assistant_content" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "game_turns_player_content_length" CHECK (length(btrim("player_content")) BETWEEN 1 AND 8000),
	CONSTRAINT "game_turns_assistant_content_length" CHECK (length(btrim("assistant_content")) BETWEEN 1 AND 100000),
	CONSTRAINT "game_turns_model_length" CHECK (length(btrim("model")) BETWEEN 1 AND 200)
);
--> statement-breakpoint
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "game_turns" ADD CONSTRAINT "game_turns_parent_turn_id_game_turns_id_fk" FOREIGN KEY ("parent_turn_id") REFERENCES "public"."game_turns"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "game_turns_session_created_idx" ON "game_turns" USING btree ("session_id", "created_at");
--> statement-breakpoint
CREATE INDEX "game_turns_parent_idx" ON "game_turns" USING btree ("parent_turn_id");
