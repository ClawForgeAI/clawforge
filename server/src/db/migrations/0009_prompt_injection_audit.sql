ALTER TABLE "audit_events"
  ADD COLUMN IF NOT EXISTS "prompt_injection_detected" boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "prompt_injection_confidence" integer,
  ADD COLUMN IF NOT EXISTS "prompt_injection_signals" jsonb;

CREATE INDEX IF NOT EXISTS "audit_events_org_prompt_injection_idx"
  ON "audit_events" USING btree ("org_id", "prompt_injection_detected", "timestamp");
