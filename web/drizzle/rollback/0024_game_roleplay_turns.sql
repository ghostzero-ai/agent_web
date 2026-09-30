DROP TABLE IF EXISTS "game_turns";
--> statement-breakpoint
ALTER TABLE "game_sessions" DROP COLUMN IF EXISTS "active_leaf_turn_id";
