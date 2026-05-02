ALTER TABLE "client_heartbeats"
ADD COLUMN "group_name" text;

ALTER TABLE "client_heartbeats"
ADD COLUMN "tags" jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX "client_heartbeats_org_group_idx" ON "client_heartbeats" USING btree ("org_id", "group_name");
CREATE INDEX "client_heartbeats_tags_gin_idx" ON "client_heartbeats" USING gin ("tags");
