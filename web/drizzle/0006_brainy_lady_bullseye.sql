DELETE FROM "model_credentials" AS older
USING "model_credentials" AS newer
WHERE older."user_id" = newer."user_id"
  AND (
    older."updated_at" < newer."updated_at"
    OR (older."updated_at" = newer."updated_at" AND older."id" < newer."id")
  );--> statement-breakpoint
DROP INDEX "model_credentials_user_provider_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "model_credentials_user_unique" ON "model_credentials" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "model_credentials" ADD CONSTRAINT "model_credentials_provider_nonempty" CHECK (length(btrim("model_credentials"."provider")) > 0);
