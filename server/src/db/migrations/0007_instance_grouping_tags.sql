ALTER TABLE "client_heartbeats"
ADD COLUMN IF NOT EXISTS "group_name" text;

ALTER TABLE "client_heartbeats"
ADD COLUMN IF NOT EXISTS "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "client_heartbeats_org_group_idx" ON "client_heartbeats" USING btree ("org_id", "group_name");
CREATE INDEX IF NOT EXISTS "client_heartbeats_tags_gin_idx" ON "client_heartbeats" USING gin ("tags");
