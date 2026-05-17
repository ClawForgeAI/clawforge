ALTER TABLE "approved_skills" ADD COLUMN IF NOT EXISTS "version" integer DEFAULT 1 NOT NULL;
ALTER TABLE "approved_skills" ADD COLUMN IF NOT EXISTS "revoked_at" timestamp with time zone;
ALTER TABLE "approved_skills" ADD COLUMN IF NOT EXISTS "revoked_by" uuid;
