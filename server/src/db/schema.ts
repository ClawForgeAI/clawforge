/**
 * Drizzle ORM schema for ClawForge control plane.
 */

import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  boolean,
  bigserial,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  ssoConfig: jsonb("sso_config").$type<{
    issuerUrl: string;
    clientId: string;
    audience?: string;
  }>(),
  settings: jsonb("settings").$type<{
    auditRetentionDays?: number;
    heartbeatOnlineThresholdMs?: number;
    heartbeatOfflineThresholdMs?: number;
    defaultNewUserRole?: "admin" | "viewer" | "user";
    killSwitchDefaultMessage?: string;
  }>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Users (#38: added viewer role)
// ---------------------------------------------------------------------------

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    name: text("name"),
    role: text("role", { enum: ["super_admin", "admin", "policy_admin", "security_admin", "viewer", "user"] })
      .notNull()
      .default("user"),
    passwordHash: text("password_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_org_email_idx").on(table.orgId, table.email)],
);

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export const policies = pgTable(
  "policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Default Policy"),
    isDefault: boolean("is_default").notNull().default(false),
    version: integer("version").notNull().default(1),
    toolsConfig: jsonb("tools_config").$type<{
      allow?: string[];
      deny?: string[];
      profile?: string;
    }>(),
    skillsConfig: jsonb("skills_config").$type<{
      requireApproval: boolean;
      approved: Array<{ name: string; key: string; scope: "org" | "self" }>;
    }>(),
    killSwitch: boolean("kill_switch").notNull().default(false),
    killSwitchMessage: text("kill_switch_message"),
    auditLevel: text("audit_level", { enum: ["full", "metadata", "off"] })
      .notNull()
      .default("metadata"),
    dlpConfig: jsonb("dlp_config").$type<{
      rules: Array<{
        name: string;
        pattern: string;
        action: "block" | "warn" | "log";
        severity: "critical" | "high" | "medium" | "info";
        category?: string;
        enabled?: boolean;
        message?: string;
      }>;
    }>(),
    // AGT-canonical fields (Cut 1 step 6 — addendum §A4). Nullable during the
    // migration window so legacy rows still load. Step 9 routes populate these
    // on write; step 10 drops the legacy *Config columns.
    yamlSource: text("yaml_source"),
    parsedPolicy: jsonb("parsed_policy").$type<Record<string, unknown>>(),
    schemaVersion: text("schema_version"),
    createdBy: uuid("created_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("policies_org_id_idx").on(table.orgId)],
);

// ---------------------------------------------------------------------------
// Policy Assignments (#23)
// ---------------------------------------------------------------------------

export const policyAssignments = pgTable(
  "policy_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
    role: text("role"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("policy_assignments_org_idx").on(table.orgId),
    index("policy_assignments_user_idx").on(table.userId),
  ],
);

// ---------------------------------------------------------------------------
// Policy Change Requests (#62)
// ---------------------------------------------------------------------------

export const policyChangeRequests = pgTable(
  "policy_change_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => policies.id, { onDelete: "cascade" }),
    changeType: text("change_type", { enum: ["create", "update", "delete"] })
      .notNull()
      .default("update"),
    status: text("status", { enum: ["pending", "approved", "rejected"] })
      .notNull()
      .default("pending"),
    requestedBy: uuid("requested_by")
      .notNull()
      .references(() => users.id),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    proposedChanges: jsonb("proposed_changes").$type<Record<string, unknown>>().notNull(),
    beforeState: jsonb("before_state").$type<Record<string, unknown>>(),
    rejectionReason: text("rejection_reason"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("policy_change_requests_org_status_idx").on(table.orgId, table.status),
    index("policy_change_requests_policy_idx").on(table.policyId),
  ],
);

// ---------------------------------------------------------------------------
// Skill Submissions
// ---------------------------------------------------------------------------

export const skillSubmissions = pgTable(
  "skill_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    submittedBy: uuid("submitted_by")
      .notNull()
      .references(() => users.id),
    skillName: text("skill_name").notNull(),
    skillKey: text("skill_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    manifestContent: text("manifest_content"),
    scanResults: jsonb("scan_results").$type<{
      scannedFiles: number;
      critical: number;
      warn: number;
      info: number;
      findings: Array<{
        ruleId: string;
        severity: string;
        file: string;
        line: number;
        message: string;
        evidence: string;
      }>;
    }>(),
    status: text("status", {
      enum: ["pending", "approved-org", "approved-self", "rejected"],
    })
      .notNull()
      .default("pending"),
    reviewedBy: uuid("reviewed_by").references(() => users.id),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("skill_submissions_org_status_idx").on(table.orgId, table.status)],
);

// ---------------------------------------------------------------------------
// Approved Skills
// ---------------------------------------------------------------------------

export const approvedSkills = pgTable(
  "approved_skills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    skillName: text("skill_name").notNull(),
    skillKey: text("skill_key").notNull(),
    scope: text("scope", { enum: ["org", "self"] })
      .notNull()
      .default("org"),
    approvedForUser: uuid("approved_for_user").references(() => users.id),
    version: integer("version").notNull().default(1),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokedBy: uuid("revoked_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("approved_skills_org_idx").on(table.orgId)],
);

// ---------------------------------------------------------------------------
// Audit Events
// ---------------------------------------------------------------------------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    eventType: text("event_type").notNull(),
    toolName: text("tool_name"),
    outcome: text("outcome").notNull(),
    agentId: text("agent_id"),
    sessionKey: text("session_key"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    promptInjectionDetected: boolean("prompt_injection_detected").notNull().default(false),
    promptInjectionConfidence: integer("prompt_injection_confidence"),
    promptInjectionSignals: jsonb("prompt_injection_signals").$type<string[]>(),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_org_ts_idx").on(table.orgId, table.timestamp),
    index("audit_events_org_user_idx").on(table.orgId, table.userId),
    index("audit_events_org_prompt_injection_idx").on(table.orgId, table.promptInjectionDetected, table.timestamp),
  ],
);

// ---------------------------------------------------------------------------
// Client Heartbeats
// ---------------------------------------------------------------------------

export const clientHeartbeats = pgTable(
  "client_heartbeats",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    lastHeartbeatAt: timestamp("last_heartbeat_at", { withTimezone: true }).notNull().defaultNow(),
    clientVersion: text("client_version"),
    startupId: text("startup_id"),
    groupName: text("group_name"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
  },
  (table) => [
    uniqueIndex("client_heartbeats_org_user_idx").on(table.orgId, table.userId),
    index("client_heartbeats_org_group_idx").on(table.orgId, table.groupName),
  ],
);

// ---------------------------------------------------------------------------
// Enrollment Tokens
// ---------------------------------------------------------------------------

export const enrollmentTokens = pgTable(
  "enrollment_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    label: text("label"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    maxUses: integer("max_uses"),
    usedCount: integer("used_count").notNull().default(0),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("enrollment_tokens_org_idx").on(table.orgId),
    uniqueIndex("enrollment_tokens_token_idx").on(table.token),
  ],
);

// ---------------------------------------------------------------------------
// API Keys (#44)
// ---------------------------------------------------------------------------

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    keyPrefix: text("key_prefix").notNull(),
    role: text("role", { enum: ["super_admin", "admin", "policy_admin", "security_admin", "viewer"] })
      .notNull()
      .default("viewer"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ipAllowlist: jsonb("ip_allowlist").$type<string[]>(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("api_keys_org_idx").on(table.orgId), uniqueIndex("api_keys_prefix_idx").on(table.keyPrefix)],
);

// ---------------------------------------------------------------------------
// Permissions (#61)
// ---------------------------------------------------------------------------

export const permissions = pgTable(
  "permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    description: text("description"),
    resource: text("resource").notNull(),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("permissions_name_idx").on(table.name)],
);

// ---------------------------------------------------------------------------
// Roles (#61)
// ---------------------------------------------------------------------------

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id").references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    isBuiltIn: boolean("is_built_in").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("roles_org_name_idx").on(table.orgId, table.name)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    permissionId: uuid("permission_id")
      .notNull()
      .references(() => permissions.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("role_permissions_role_perm_idx").on(table.roleId, table.permissionId)],
);

// ---------------------------------------------------------------------------
// Webhooks (#43)
// ---------------------------------------------------------------------------

export const webhooks = pgTable(
  "webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull(),
    secret: text("secret").notNull(),
    events: jsonb("events").$type<string[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("webhooks_org_idx").on(table.orgId)],
);

export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .notNull()
      .references(() => webhooks.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    status: text("status", { enum: ["pending", "success", "failed"] })
      .notNull()
      .default("pending"),
    responseCode: integer("response_code"),
    responseBody: text("response_body"),
    latencyMs: integer("latency_ms"),
    attempt: integer("attempt").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("webhook_deliveries_webhook_idx").on(table.webhookId),
    index("webhook_deliveries_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Alert Rules (#51)
// ---------------------------------------------------------------------------

export const alertRules = pgTable(
  "alert_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    ruleType: text("rule_type", {
      enum: [
        "denied_tool_burst",
        "dlp_violation_burst",
        "off_hours_activity",
        "sensitive_tool_access",
        "session_anomaly",
        "blocked_tool_persistence",
      ],
    }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    config: jsonb("config").$type<Record<string, unknown>>().notNull(),
    severity: text("severity", { enum: ["critical", "high", "medium", "low"] })
      .notNull()
      .default("medium"),
    webhookUrl: text("webhook_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("alert_rules_org_idx").on(table.orgId)],
);

// ---------------------------------------------------------------------------
// Alerts (#51)
// ---------------------------------------------------------------------------

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    ruleId: uuid("rule_id")
      .notNull()
      .references(() => alertRules.id, { onDelete: "cascade" }),
    userId: uuid("user_id"),
    severity: text("severity", { enum: ["critical", "high", "medium", "low"] })
      .notNull()
      .default("medium"),
    status: text("status", { enum: ["open", "acknowledged", "resolved"] })
      .notNull()
      .default("open"),
    title: text("title").notNull(),
    details: jsonb("details").$type<Record<string, unknown>>(),
    relatedEventIds: jsonb("related_event_ids").$type<string[]>(),
    acknowledgedBy: uuid("acknowledged_by").references(() => users.id),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    resolvedBy: uuid("resolved_by").references(() => users.id),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("alerts_org_status_idx").on(table.orgId, table.status),
    index("alerts_org_ts_idx").on(table.orgId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// AGT-canonical tables (Cut 1 step 6 — addendum §A4).
// These ship alongside the legacy tables during the migration window. Routes
// landing in step 9 read/write these. Legacy tables (policyChangeRequests,
// skillSubmissions, approvedSkills, auditEvents) remain available until
// step 10 retires them.
// ---------------------------------------------------------------------------

export const identities = pgTable(
  "identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    did: text("did").notNull(),
    publicKey: text("public_key").notNull(),
    parentDid: text("parent_did"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    status: text("status", { enum: ["active", "suspended", "revoked"] })
      .notNull()
      .default("active"),
    name: text("name"),
    description: text("description"),
    sponsor: text("sponsor"),
    delegationDepth: integer("delegation_depth").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("identities_org_did_idx").on(table.orgId, table.did),
    index("identities_org_status_idx").on(table.orgId, table.status),
    index("identities_parent_idx").on(table.parentDid),
  ],
);

export const delegations = pgTable(
  "delegations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    issuerDid: text("issuer_did").notNull(),
    subjectDid: text("subject_did").notNull(),
    grantedCapabilities: jsonb("granted_capabilities").$type<string[]>().notNull().default([]),
    deniedCapabilities: jsonb("denied_capabilities").$type<string[]>().notNull().default([]),
    signedToken: text("signed_token"),
    depth: integer("depth").notNull().default(1),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("delegations_org_issuer_idx").on(table.orgId, table.issuerDid),
    index("delegations_org_subject_idx").on(table.orgId, table.subjectDid),
  ],
);

export const trustScores = pgTable(
  "trust_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    did: text("did").notNull(),
    overall: integer("overall").notNull().default(50),
    dimensions: jsonb("dimensions").$type<Record<string, number>>().notNull().default({}),
    tier: text("tier", { enum: ["Untrusted", "Provisional", "Trusted", "Verified"] })
      .notNull()
      .default("Provisional"),
    lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("trust_scores_org_did_idx").on(table.orgId, table.did)],
);

export const auditEntries = pgTable(
  "audit_entries",
  {
    chainSeq: bigserial("chain_seq", { mode: "bigint" }).primaryKey(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
    agentDid: text("agent_did").notNull(),
    action: text("action").notNull(),
    decision: text("decision", { enum: ["allow", "deny", "review"] }).notNull(),
    hash: text("hash").notNull(),
    previousHash: text("previous_hash").notNull(),
    policyName: text("policy_name"),
    policyVersion: integer("policy_version"),
    matchedRule: text("matched_rule"),
    payload: jsonb("payload").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("audit_entries_org_ts_idx").on(table.orgId, table.timestamp),
    index("audit_entries_org_agent_idx").on(table.orgId, table.agentDid),
    uniqueIndex("audit_entries_org_hash_idx").on(table.orgId, table.hash),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentDid: text("agent_did"),
    actionType: text("action_type", {
      enum: ["skill_load", "policy_change", "tool_call", "delegation"],
    }).notNull(),
    target: text("target"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status", { enum: ["pending", "approved", "denied", "expired"] })
      .notNull()
      .default("pending"),
    requiredApprovers: jsonb("required_approvers").$type<string[]>().notNull().default([]),
    decisions: jsonb("decisions")
      .$type<Array<{ decidedBy: string; decision: "approved" | "denied"; comment?: string; decidedAt: string }>>()
      .notNull()
      .default([]),
    obligations: jsonb("obligations").$type<Record<string, unknown>>(),
    requestedBy: uuid("requested_by").references(() => users.id),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (table) => [
    index("approvals_org_status_idx").on(table.orgId, table.status),
    index("approvals_org_action_idx").on(table.orgId, table.actionType),
  ],
);

export const killSwitchScopes = pgTable(
  "kill_switch_scopes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    scope: jsonb("scope")
      .$type<{
        kind: "org" | "agent" | "role" | "tag";
        agentDid?: string;
        role?: string;
        tag?: string;
      }>()
      .notNull(),
    active: boolean("active").notNull().default(false),
    message: text("message"),
    activatedBy: uuid("activated_by").references(() => users.id),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    clearedBy: uuid("cleared_by").references(() => users.id),
    clearedAt: timestamp("cleared_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("kill_switch_scopes_org_active_idx").on(table.orgId, table.active)],
);

export const metrics = pgTable(
  "metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    agentDid: text("agent_did"),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("metrics_org_ts_idx").on(table.orgId, table.recordedAt)],
);

export const shadowAgents = pgTable(
  "shadow_agents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    did: text("did"),
    capabilities: jsonb("capabilities").$type<string[]>().notNull().default([]),
    runtime: text("runtime"),
    fingerprint: text("fingerprint"),
    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull().defaultNow(),
    status: text("status", { enum: ["unknown", "investigating", "known", "quarantined"] })
      .notNull()
      .default("unknown"),
    notes: text("notes"),
  },
  (table) => [
    index("shadow_agents_org_status_idx").on(table.orgId, table.status),
    index("shadow_agents_org_lastseen_idx").on(table.orgId, table.lastSeen),
  ],
);
