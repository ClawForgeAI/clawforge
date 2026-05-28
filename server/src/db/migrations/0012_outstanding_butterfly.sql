-- Cut 1 step 6 — AGT-canonical tables and policies columns.
-- Idempotent (per project convention) so redundant statements caused by
-- drizzle snapshots lagging behind hand-written migrations no-op cleanly.

-- ---------------------------------------------------------------------------
-- New AGT-canonical tables (addendum §A4)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_did" text,
	"action_type" text NOT NULL,
	"target" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"required_approvers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"obligations" jsonb,
	"requested_by" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_entries" (
	"chain_seq" bigserial PRIMARY KEY NOT NULL,
	"org_id" uuid NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"agent_did" text NOT NULL,
	"action" text NOT NULL,
	"decision" text NOT NULL,
	"hash" text NOT NULL,
	"previous_hash" text NOT NULL,
	"policy_name" text,
	"policy_version" integer,
	"matched_rule" text,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delegations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"issuer_did" text NOT NULL,
	"subject_did" text NOT NULL,
	"granted_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"denied_capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"signed_token" text,
	"depth" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "identities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"did" text NOT NULL,
	"public_key" text NOT NULL,
	"parent_did" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"name" text,
	"description" text,
	"sponsor" text,
	"delegation_depth" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "kill_switch_scopes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"scope" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"message" text,
	"activated_by" uuid,
	"activated_at" timestamp with time zone,
	"cleared_by" uuid,
	"cleared_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "metrics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"agent_did" text,
	"snapshot" jsonb NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shadow_agents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"did" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"runtime" text,
	"fingerprint" text,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'unknown' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "trust_scores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"did" text NOT NULL,
	"overall" integer DEFAULT 50 NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"tier" text DEFAULT 'Provisional' NOT NULL,
	"last_updated" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- AGT columns on the existing `policies` table
-- ---------------------------------------------------------------------------

ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "yaml_source" text;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "parsed_policy" jsonb;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "schema_version" text;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "created_by" uuid;--> statement-breakpoint
ALTER TABLE "policies" ADD COLUMN IF NOT EXISTS "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Foreign keys for new tables (wrapped in DO blocks for idempotency)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
	ALTER TABLE "approvals" ADD CONSTRAINT "approvals_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "audit_entries" ADD CONSTRAINT "audit_entries_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "delegations" ADD CONSTRAINT "delegations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "identities" ADD CONSTRAINT "identities_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "kill_switch_scopes" ADD CONSTRAINT "kill_switch_scopes_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "kill_switch_scopes" ADD CONSTRAINT "kill_switch_scopes_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "kill_switch_scopes" ADD CONSTRAINT "kill_switch_scopes_cleared_by_users_id_fk" FOREIGN KEY ("cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "metrics" ADD CONSTRAINT "metrics_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "shadow_agents" ADD CONSTRAINT "shadow_agents_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "trust_scores" ADD CONSTRAINT "trust_scores_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "policies" ADD CONSTRAINT "policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Indexes for new tables
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS "approvals_org_status_idx" ON "approvals" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "approvals_org_action_idx" ON "approvals" USING btree ("org_id","action_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entries_org_ts_idx" ON "audit_entries" USING btree ("org_id","timestamp");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_entries_org_agent_idx" ON "audit_entries" USING btree ("org_id","agent_did");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "audit_entries_org_hash_idx" ON "audit_entries" USING btree ("org_id","hash");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delegations_org_issuer_idx" ON "delegations" USING btree ("org_id","issuer_did");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "delegations_org_subject_idx" ON "delegations" USING btree ("org_id","subject_did");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "identities_org_did_idx" ON "identities" USING btree ("org_id","did");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identities_org_status_idx" ON "identities" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "identities_parent_idx" ON "identities" USING btree ("parent_did");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "kill_switch_scopes_org_active_idx" ON "kill_switch_scopes" USING btree ("org_id","active");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "metrics_org_ts_idx" ON "metrics" USING btree ("org_id","recorded_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shadow_agents_org_status_idx" ON "shadow_agents" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "shadow_agents_org_lastseen_idx" ON "shadow_agents" USING btree ("org_id","last_seen");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "trust_scores_org_did_idx" ON "trust_scores" USING btree ("org_id","did");
