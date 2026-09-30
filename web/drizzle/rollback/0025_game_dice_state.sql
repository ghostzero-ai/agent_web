DROP TABLE IF EXISTS "game_events";
--> statement-breakpoint
DROP INDEX IF EXISTS "game_turns_id_session_unique";
--> statement-breakpoint
ALTER TABLE "game_turns" DROP COLUMN IF EXISTS "state_snapshot";
--> statement-breakpoint
ALTER TABLE "game_turns" DROP COLUMN IF EXISTS "state_patch";
