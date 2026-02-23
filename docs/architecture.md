# Architecture & How It Works

## Three Packages

| Package | Path | Runs On | Description |
|---|---|---|---|
| `@openclaw/clawforge` | `plugin/` | Employee's machine | OpenClaw plugin — hooks into the gateway lifecycle, enforces policies, uploads audit events, polls heartbeat |
| `@openclaw/clawforge-server` | `server/` | Org's server / cloud | Fastify control plane API (port 4100) — manages auth, policies, skill reviews, audit storage, heartbeat, kill switch |
| `@openclaw/clawforge-admin` | `admin/` | Org's server / cloud | Next.js admin UI (port 4200) — dashboard for managing everything |

## How It All Connects

```
Employee Machine A          Employee Machine B          Employee Machine C
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   OpenClaw + CG   │       │   OpenClaw + CG   │       │   OpenClaw + CG   │
│     Plugin        │       │     Plugin        │       │     Plugin        │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         │      Heartbeat, Policy Fetch, Audit Upload          │
         │              (authenticated HTTP)                    │
         └──────────────────┬───────┴──────────────────────────┘
                            │
                   ┌────────▼─────────┐        ┌───────────────────┐
                   │  ClawForge        │        │  ClawForge Admin   │
                   │  Control Plane    │◄──────►│  Console (Web UI)  │
                   │  (API Server)     │        │                   │
                   └────────┬─────────┘        └───────────────────┘
                            │                           ▲
                       PostgreSQL                       │
                                                   Org Admin
                                                (browser access)
```

```
┌─────────────────────┐       ┌──────────────────────┐       ┌─────────────────────┐
│   OpenClaw Gateway   │       │   Control Plane API   │       │    Admin Console     │
│                     │  HTTP  │                      │  HTTP  │                     │
│  @openclaw/clawforge│◄─────►│  @openclaw/clawforge  │◄─────►│  @openclaw/clawforge │
│     (extension)     │       │       -server         │       │       -admin         │
└─────────────────────┘       └──────────┬───────────┘       └─────────────────────┘
                                         │
                                    PostgreSQL
```

---

## Core Concepts

### Organization

The top-level tenant. An org groups users, policies, skills, and audit logs. Everything in ClawForge is scoped to an org.

### Policy

Each org has one active, versioned policy that defines:

- **Tool allow/deny lists** — Which tools can the AI assistant use?
- **Skill approval requirements** — Must skills be reviewed before use?
- **Audit level** — How much is logged? (`full` / `metadata` / `off`)
- **Kill switch state** — Is all tool access disabled?

Policies are fetched by each OpenClaw instance and enforced locally. When the admin updates a policy, connected instances detect the new version on their next heartbeat and refresh.

### Enrollment

How an employee's OpenClaw instance joins the org. Users authenticate via SSO/OIDC (`/clawforge-login`) or email/password. The control plane links them to the org, and the plugin stores a session locally at `~/.clawforge/session.json`.

### Heartbeat

Each connected instance periodically polls the control plane. The heartbeat serves two purposes:

1. **Liveness** — The admin sees which instances are online.
2. **State sync** — The instance learns about kill switch changes and policy updates.

### Audit Trail

Every tool call, session event, and (optionally) LLM interaction is batched and uploaded to the control plane. The admin can query and filter these logs in the console.

### Kill Switch

An emergency mechanism. When activated, **all** tool calls are blocked across every connected instance in the org. Propagates via heartbeat (delay = heartbeat interval).

---

## Startup Flow

1. Gateway loads the ClawForge extension
2. Extension checks for a saved session (`~/.clawforge/session.json`)
3. If expired → refresh via control plane; if missing → unauthenticated mode
4. Fetches org policy (cache → API → stale cache fallback)
5. Applies skill filter to OpenClaw config
6. Registers `before_tool_call` / `after_tool_call` / session / LLM hooks
7. Starts heartbeat polling for kill switch
8. On `gateway_stop` → flushes audit buffer, stops heartbeat

## Policy Enforcement Flow

```
User invokes tool
    │
    ▼
before_tool_call hook fires
    │
    ├── Kill switch active? → BLOCK + audit "kill_switch_activated"
    │
    ├── Tool in deny list? → BLOCK + audit "tool_call_attempt" (blocked)
    │
    ├── Allow list exists & tool not in it? → BLOCK
    │
    └── ALLOW → audit "tool_call_attempt" (allowed)
         │
         ▼
    Tool executes
         │
         ▼
    after_tool_call hook → audit "tool_call_result"
```

Tool enforcement happens **client-side** in the OpenClaw plugin, not on the control plane. The control plane's role is to serve the policy; the plugin is the enforcer.

## Policy Caching

```
On startup:
  1. Check local cache (within TTL) → use it, refresh in background
  2. Cache miss/expired → fetch from API, save to cache
  3. API unreachable → use stale cache as fallback

On heartbeat:
  - If server indicates new policy version → refresh immediately
```

---

## What ClawForge is NOT

- **Not an AI model provider** — It doesn't host or run LLMs. OpenClaw handles that.
- **Not a replacement for OpenClaw** — It adds governance on top of OpenClaw. Without OpenClaw, ClawForge has nothing to govern.
- **Not per-user config** — Policies are org-wide (with some per-user skill scoping). It is not a personal settings manager.
- **Not real-time streaming** — Communication is poll-based (heartbeat). Kill switch propagation has a delay equal to the heartbeat interval.

---

## Database Schema

8 tables managed by Drizzle ORM:

| Table | Purpose |
|---|---|
| `organizations` | Org registry with optional SSO config (issuer, client ID, audience) |
| `users` | Org members with role (`admin` / `user`) and optional password hash |
| `policies` | Versioned org policies (tools, skills, audit level, kill switch) |
| `skill_submissions` | Skill review queue with security scan results |
| `approved_skills` | Approved skills per org, with optional per-user scope |
| `audit_events` | Tool calls, session lifecycle, LLM I/O events |
| `client_heartbeats` | Last heartbeat timestamp per user per org |
| `enrollment_tokens` | Admin-generated tokens for user onboarding |

### Entity Relationship

```
organizations (1) ──┬── (N) users
                    ├── (1) policies
                    ├── (N) skill_submissions
                    ├── (N) approved_skills
                    ├── (N) audit_events
                    ├── (N) client_heartbeats
                    └── (N) enrollment_tokens
```

### Table Details

#### `organizations`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `name` | TEXT | Org display name |
| `sso_config` | JSONB | `{issuerUrl, clientId, audience?}` |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

#### `users`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `org_id` | UUID (FK → organizations) | |
| `email` | TEXT | Unique per org |
| `name` | TEXT | From OIDC claims or enrollment |
| `role` | TEXT | `admin` or `user` |
| `password_hash` | TEXT | Bcrypt hash (null for SSO-only users) |
| `last_seen_at` | TIMESTAMPTZ | Updated on auth |
| `created_at` | TIMESTAMPTZ | |

Unique index: `(org_id, email)`

#### `policies`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `org_id` | UUID (FK, unique) | One policy per org |
| `version` | INT | Incremented on each update |
| `tools_config` | JSONB | `{allow?, deny?, profile?}` |
| `skills_config` | JSONB | `{requireApproval, approved[]}` |
| `kill_switch` | BOOLEAN | |
| `kill_switch_message` | TEXT | Shown to users when active |
| `audit_level` | TEXT | `full`, `metadata`, or `off` |
| `updated_at` | TIMESTAMPTZ | |

#### `skill_submissions`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `org_id` | UUID (FK) | |
| `submitted_by` | UUID (FK → users) | |
| `skill_name` | TEXT | |
| `skill_key` | TEXT | Optional unique key |
| `metadata` | JSONB | Arbitrary key-value data |
| `manifest_content` | TEXT | Full SKILL.md content |
| `scan_results` | JSONB | `{scannedFiles, critical, warn, info, findings[]}` |
| `status` | TEXT | `pending`, `approved-org`, `approved-self`, `rejected` |
| `reviewed_by` | UUID (FK → users) | |
| `review_notes` | TEXT | |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

Index: `(org_id, status)`

#### `approved_skills`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `org_id` | UUID (FK) | |
| `skill_name` | TEXT | |
| `skill_key` | TEXT | |
| `scope` | TEXT | `org` or `self` |
| `approved_for_user` | UUID (FK → users) | Set for `self` scope |
| `created_at` | TIMESTAMPTZ | |

Index: `(org_id)`

#### `audit_events`

| Column | Type | Description |
|---|---|---|
| `id` | UUID | |
| `org_id` | UUID (FK) | |
| `user_id` | UUID | |
| `event_type` | TEXT | `tool_call_attempt`, `tool_call_result`, `session_start`, etc. |
| `tool_name` | TEXT | For tool-related events |
| `outcome` | TEXT | `allowed`, `blocked`, `error`, `success` |
| `agent_id` | TEXT | |
| `session_key` | TEXT | |
| `metadata` | JSONB | |
| `timestamp` | TIMESTAMPTZ | Event time |

Indexes: `(org_id, timestamp)`, `(org_id, user_id)`. Partitioned by range on `timestamp` (after migration 0001).

#### `client_heartbeats`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | |
| `org_id` | UUID (FK) | |
| `user_id` | UUID (FK → users) | |
| `last_heartbeat_at` | TIMESTAMPTZ | |
| `client_version` | TEXT | |

Unique index: `(org_id, user_id)` — upserted on each heartbeat.

#### `enrollment_tokens`

| Column | Type | Description |
|---|---|---|
| `id` | UUID (PK) | Auto-generated |
| `org_id` | UUID (FK → organizations) | |
| `token` | TEXT (unique) | Base64url token string |
| `label` | TEXT | Optional human-readable label |
| `expires_at` | TIMESTAMPTZ | Optional expiry |
| `max_uses` | INT | Optional usage cap |
| `used_count` | INT | Current usage count (default 0) |
| `created_by` | UUID (FK → users) | Admin who created the token |
| `revoked_at` | TIMESTAMPTZ | Set when revoked |
| `created_at` | TIMESTAMPTZ | |

Indexes: `(org_id)`, unique on `(token)`
