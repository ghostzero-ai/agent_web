UPDATE "conversations" SET "mode" = 'auto' WHERE "mode" = 'entertainment';--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "mode" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "public"."conversation_mode" RENAME TO "conversation_mode_with_entertainment";--> statement-breakpoint
CREATE TYPE "public"."conversation_mode" AS ENUM('auto', 'professional', 'companion', 'reflection');--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "mode" TYPE "public"."conversation_mode" USING "mode"::text::"public"."conversation_mode";--> statement-breakpoint
ALTER TABLE "conversations" ALTER COLUMN "mode" SET DEFAULT 'auto'::"public"."conversation_mode";--> statement-breakpoint
DROP TYPE "public"."conversation_mode_with_entertainment";
