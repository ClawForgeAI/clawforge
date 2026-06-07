CREATE TABLE IF NOT EXISTS "enrollment_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "token" text NOT NULL UNIQUE,
  "label" text,
  "expires_at" timestamp with time zone,
  "max_uses" integer,
  "used_count" integer NOT NULL DEFAULT 0,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "revoked_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "enrollment_tokens_org_idx" ON "enrollment_tokens" ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "enrollment_tokens_token_idx" ON "enrollment_tokens" ("token");
