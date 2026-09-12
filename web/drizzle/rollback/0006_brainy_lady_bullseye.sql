DROP INDEX IF EXISTS "model_credentials_user_unique";--> statement-breakpoint
ALTER TABLE "model_credentials" DROP CONSTRAINT IF EXISTS "model_credentials_provider_nonempty";--> statement-breakpoint
CREATE UNIQUE INDEX "model_credentials_user_provider_unique" ON "model_credentials" USING btree ("user_id", "provider");
