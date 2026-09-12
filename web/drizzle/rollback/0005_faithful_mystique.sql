DROP TABLE IF EXISTS "notification_deliveries";--> statement-breakpoint
DROP TABLE IF EXISTS "push_subscriptions";--> statement-breakpoint
DROP TABLE IF EXISTS "notification_preferences";--> statement-breakpoint
DROP TABLE IF EXISTS "push_vapid_configurations";--> statement-breakpoint
ALTER TABLE "inbox_items" DROP COLUMN IF EXISTS "push_planned_at";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."notification_delivery_status";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."push_subscription_status";
