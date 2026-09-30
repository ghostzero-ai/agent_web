DROP TABLE IF EXISTS "game_checkpoints";
--> statement-breakpoint
ALTER TABLE "game_turns" ALTER COLUMN "state_snapshot" SET DEFAULT '{"scene":"","objectives":[],"flags":{},"resources":{},"inventory":{}}'::jsonb;
--> statement-breakpoint
DELETE FROM "game_events" WHERE "kind" = 'rule_check';
--> statement-breakpoint
ALTER TABLE "game_events" DROP CONSTRAINT "game_events_kind_supported";
--> statement-breakpoint
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_kind_supported" CHECK ("kind" = 'dice_roll');
--> statement-breakpoint
ALTER TABLE "game_characters" DROP CONSTRAINT IF EXISTS "game_characters_max_health_positive";
--> statement-breakpoint
ALTER TABLE "game_characters" DROP CONSTRAINT IF EXISTS "game_characters_attributes_object";
--> statement-breakpoint
ALTER TABLE "game_characters" DROP COLUMN IF EXISTS "max_health";
--> statement-breakpoint
ALTER TABLE "game_characters" DROP COLUMN IF EXISTS "attributes";
