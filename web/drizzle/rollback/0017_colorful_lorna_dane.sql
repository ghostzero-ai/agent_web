DROP TABLE "memory_usages";
--> statement-breakpoint
DROP INDEX "memory_items_user_pinned_updated_idx";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP CONSTRAINT "memory_items_sensitivity_supported";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP CONSTRAINT "memory_items_content_nonempty";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP CONSTRAINT "memory_items_use_count_nonnegative";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP COLUMN "sensitivity";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP COLUMN "pinned";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP COLUMN "valid_until";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP COLUMN "last_used_at";
--> statement-breakpoint
ALTER TABLE "memory_items" DROP COLUMN "use_count";
