-- Migration: v1 features
-- #38: Add viewer role to users
-- #44: Add api_keys table

-- Update role check constraint to include 'viewer'
-- (Drizzle text enums are application-level; no DB constraint to alter for pgTable text fields)

-- API Keys table (#44)
CREATE TABLE IF NOT EXISTS "api_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "key_hash" text NOT NULL,
  "key_prefix" text NOT NULL,
  "role" text DEFAULT 'viewer' NOT NULL,
  "expires_at" timestamp with time zone,
  "ip_allowlist" jsonb,
  "last_used_at" timestamp with time zone,
  "revoked_at" timestamp with time zone,
  "created_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "api_keys_org_idx" ON "api_keys" USING btree ("org_id");
CREATE UNIQUE INDEX IF NOT EXISTS "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");
