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
    role: text("role", { enum: ["admin", "viewer", "user"] })
      .notNull()
      .default("user"),
    passwordHash: text("password_hash"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("users_org_email_idx").on(table.orgId, table.email),
  ],
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
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("policies_org_id_idx").on(table.orgId),
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
  (table) => [
    index("skill_submissions_org_status_idx").on(table.orgId, table.status),
  ],
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
  (table) => [
    index("approved_skills_org_idx").on(table.orgId),
  ],
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
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_org_ts_idx").on(table.orgId, table.timestamp),
    index("audit_events_org_user_idx").on(table.orgId, table.userId),
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
  },
  (table) => [
    uniqueIndex("client_heartbeats_org_user_idx").on(table.orgId, table.userId),
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
    role: text("role", { enum: ["admin", "viewer"] })
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
  (table) => [
    index("api_keys_org_idx").on(table.orgId),
    uniqueIndex("api_keys_prefix_idx").on(table.keyPrefix),
  ],
);
