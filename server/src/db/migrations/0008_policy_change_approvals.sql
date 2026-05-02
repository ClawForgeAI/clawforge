CREATE TABLE "policy_change_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "org_id" uuid NOT NULL,
  "policy_id" uuid NOT NULL,
  "change_type" text DEFAULT 'update' NOT NULL,
  "status" text DEFAULT 'pending' NOT NULL,
  "requested_by" uuid NOT NULL,
  "reviewed_by" uuid,
  "proposed_changes" jsonb NOT NULL,
  "before_state" jsonb,
  "rejection_reason" text,
  "reviewed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "policy_change_requests" ADD CONSTRAINT "policy_change_requests_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_change_requests" ADD CONSTRAINT "policy_change_requests_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_change_requests" ADD CONSTRAINT "policy_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "policy_change_requests" ADD CONSTRAINT "policy_change_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "policy_change_requests_org_status_idx" ON "policy_change_requests" USING btree ("org_id","status");
--> statement-breakpoint
CREATE INDEX "policy_change_requests_policy_idx" ON "policy_change_requests" USING btree ("policy_id");
