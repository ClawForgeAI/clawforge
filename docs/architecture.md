# Architecture & How It Works

ClawForge is a control plane for AI agents at work. This document covers the four-layer architecture, the three packages that implement it today, the control flows between them, deployment shape, and the database schema.

For the product vision behind the architecture, see [BOOT.md](BOOT.md). For the forward-looking platform direction (multi-runtime adapter extraction, package primitives), see [technical-strategy.md](technical-strategy.md).

---

## Four-layer architecture

ClawForge meets each runtime where it lives — local enforcement where the runtime supports it, MCP proxying where it doesn't, and an append-only audit pipeline either way.

| Layer                       | Role                                                                                                                                                                       |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Agents**                  | The assistants themselves: Claude Code, OpenClaw, OpenAI Agents, LangGraph, MCP servers, Microsoft AGT, custom enterprise agents.                                          |
| **Adapters & interception** | Runtime-specific surfaces that translate ClawForge policy into something the agent's runtime understands — SDK hooks, MCP proxying, AGT integration, native runtime hooks. |
| **Governance runtime**      | Local enforcement, audit emission, heartbeat behaviour. Sits close to the agent rather than waiting on a round-trip to the cloud.                                          |
| **Control plane**           | The operator surface: policy authoring, audit federation, approval queues, emergency state.                                                                                |

### Trust boundaries

- **Assistant runtime** — enforces policy, tracks local state, uploads audit data.
- **Control plane API** — stores org policy, audit records, identity state, and runtime status.
- **Operator console** — review and response surface used by admins and platform teams.
- **Customer environment** — self-hosted deployment keeps control-plane services and storage under customer ownership.

### Core control flows

- **Policy enforcement** — versioned centrally, enforced close to the runtime.
- **Audit emission** — runtimes emit tool and session events upward into the control plane.
- **Heartbeat & control propagation** — reports liveness, checks policy freshness, carries kill-switch state.
- **Kill-switch behaviour** — emergency controls publish through the same policy loop, with a local fail-secure posture when the control plane stops responding.

---

## Three Packages (today)

| Package                         | Path      | Role                                                                                                                      | Runs On              |
| ------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| `@clawforgeai/clawforge`        | `plugin/` | **OpenClaw runtime adapter** — first adapter; more planned (see [technical-strategy.md](technical-strategy.md))           | Agent's machine      |
| `@ClawForgeAI/clawforge-server` | `server/` | **Control plane API** (Fastify, port 4100) — manages auth, policies, skill reviews, audit storage, heartbeat, kill switch | Org's server / cloud |
| `@ClawForgeAI/clawforge-admin`  | `admin/`  | **Operator console** (Next.js, port 4200) — dashboard for managing everything                                             | Org's server / cloud |

Today the only shipping adapter is the OpenClaw plugin; the Claude Code path runs through that same adapter surface. Adapters for MCP servers, OpenAI Agents, LangGraph, and Microsoft AGT are on the roadmap (see [roadmap.md](roadmap.md)).

### How it all connects

```
   Claude Code               OpenClaw Gateway         (future adapters:
   ┌──────────┐              ┌──────────────┐         MCP, OpenAI, LangGraph,
   │  Adapter │              │   Adapter     │          AGT, custom)
   └────┬─────┘              └──────┬───────┘
        │                           │
        │   Heartbeat, Policy Fetch, Audit Upload
        │              (authenticated HTTP)
        └─────────────┬─────────────┘
                      │
             ┌────────▼─────────┐        ┌───────────────────┐
             │  Control Plane    │        │  Operator Console  │
             │  (API Server)     │◄──────►│  (Admin Web UI)    │
             └────────┬─────────┘        └───────────────────┘
                      │                           ▲
                 PostgreSQL                       │
                                              Org Admin
```

---

## Core Concepts

### Organization

The top-level tenant. An org groups users, policies, skills, and audit logs. Everything in ClawForge is scoped to an org.

### Policy

Each org has one active, versioned policy that defines:

- **Tool allow/deny lists** — Which tools can the AI agent use?
- **Skill approval requirements** — Must skills be reviewed before use?
- **Audit level** — How much is logged? (`full` / `metadata` / `off`)
- **Kill switch state** — Is all tool access disabled?

Policies are fetched by each runtime adapter and enforced locally. When the admin updates a policy, connected runtimes detect the new version on their next heartbeat and refresh.

### Enrollment

How an agent runtime joins the org. Users authenticate via SSO/OIDC (`/clawforge-login`) or email/password. The control plane links them to the org, and the adapter stores a session locally at `~/.clawforge/session.json`.

### Heartbeat

Each connected runtime periodically polls the control plane. The heartbeat serves two purposes:

1. **Liveness** — The admin sees which runtimes are online.
2. **State sync** — The runtime learns about kill switch changes and policy updates.

### Audit Trail

Every tool call, session event, and (optionally) LLM interaction is batched and uploaded to the control plane. The admin can query and filter these logs in the console.

### Kill Switch

An emergency mechanism. Propagates via heartbeat (delay = heartbeat interval). See the kill-switch model in [BOOT.md](BOOT.md) — heartbeat-driven, fail-secure on silence, policy-graded rather than binary.

---

## Startup Flow

1. Runtime loads the ClawForge adapter
2. Adapter checks for a saved session (`~/.clawforge/session.json`)
3. If expired → refresh via control plane; if missing → unauthenticated mode
4. Fetches org policy (cache → API → stale cache fallback)
5. Applies skill filter to runtime config
6. Registers `before_tool_call` / `after_tool_call` / session / LLM hooks
7. Starts heartbeat polling for kill switch
8. On runtime shutdown → flushes audit buffer, stops heartbeat

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

Tool enforcement happens **locally in the adapter**, not on the control plane. The control plane is the source of truth; the adapter is the enforcer.

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

- **Not an AI model provider** — It doesn't host or run LLMs. The agent runtime handles that.
- **Not a detection product** — It is not a prompt scanner, output monitor, or risk-flag dashboard. It is the operations surface above those.
- **Not per-user config** — Policies are org-wide (with some per-user skill scoping). It is not a personal settings manager.
- **Not real-time streaming today** — Communication is poll-based (heartbeat). Kill switch propagation has a delay equal to the heartbeat interval. Real-time SSE is on the roadmap.

---

## Control Plane — Server Notes

The control plane (`@ClawForgeAI/clawforge-server`) is a Fastify 5 + Drizzle ORM + PostgreSQL service. Auth uses `jose` for OIDC verification; request validation uses Zod.

### Authentication

Two methods, both issuing the same ClawForge JWTs (1-hour access, 30-day refresh):

- **Email/password** — built-in, no external dependencies.
- **SSO / OIDC** — control plane acts as a token broker between your IdP and runtime adapters.

#### Enrollment tokens

Admins generate enrollment tokens to onboard users without SSO. Tokens have optional `label`, `expiresAt`, and `maxUses`. See [api-reference.md](api-reference.md).

#### SSO grant types

| Grant                | Use Case                              | Required Fields                                                  |
| -------------------- | ------------------------------------- | ---------------------------------------------------------------- |
| `authorization_code` | Interactive browser login (PKCE)      | `code`, `codeVerifier`, `redirectUri` + `X-ClawForge-Org` header |
| `id_token`           | Direct token validation (headless/CI) | `idToken`, `orgId`                                               |
| `refresh_token`      | Renew expired session                 | `refreshToken`                                                   |

Discovery document and JWKS are cached in-memory for 1 hour. **Supported IdPs:** any OIDC-compliant provider — Okta, Auth0, Microsoft Entra ID, Google Workspace, Keycloak.

#### Auto role assignment

- **First user** in an org → `admin` role
- **Subsequent users** → `user` role

### Migrations

Migrations are managed by Drizzle Kit. Config is in `server/drizzle.config.ts`.

```bash
cd server
pnpm db:generate   # Generate migration from schema
pnpm db:migrate    # Apply pending migrations
pnpm db:seed       # Seed default org + admin user
pnpm db:studio     # Visual DB browser
```

The `0001_audit_partitioning.sql` migration converts `audit_events` to a partitioned table (by month) for production-scale deployments — run during a maintenance window. To create new monthly partitions:

```sql
CREATE TABLE audit_events_2026_07
  PARTITION OF audit_events
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
```

### Security checklist (production)

- [ ] Set a strong `JWT_SECRET` (≥ 32 random bytes); never use the dev default
- [ ] Configure `CORS_ORIGIN` to the admin domain(s) only — not `*`
- [ ] Use PostgreSQL with `?sslmode=require`
- [ ] Run `pnpm db:migrate` and `pnpm db:seed` (or use Docker)
- [ ] Run audit partitioning migration (`0001_audit_partitioning.sql`)
- [ ] Set up partition creation cron (monthly)
- [ ] Put control plane behind TLS reverse proxy (Caddy / nginx)
- [ ] Configure authentication (email/password seed, or SSO via org `sso_config`)
- [ ] Configure adapters with `controlPlaneUrl`
- [ ] Test login flow end to end (email/password or SSO)
- [ ] Set appropriate `heartbeatIntervalMs` and `heartbeatFailureThreshold`
- [ ] Monitor `/health/ready`
- [ ] Ensure session files (`~/.clawforge/session.json`) have `0600` permissions on multi-user hosts

### Recommended production topology

```
                    Internet
                       │
                    TLS (443)
                       │
                ┌──────┴──────┐
                │  Reverse     │
                │  Proxy       │
                │  (Caddy/     │
                │   nginx)     │
                └──────┬──────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
     :4100/api    :4200/admin   (static)
          │            │
  ┌───────┴───┐  ┌─────┴─────┐
  │ clawforge │  │ clawforge │
  │  -server  │  │  -admin   │
  └─────┬─────┘  └───────────┘
        │
   PostgreSQL
```

---

## Database Schema

8 tables managed by Drizzle ORM:

| Table               | Purpose                                                             |
| ------------------- | ------------------------------------------------------------------- |
| `organizations`     | Org registry with optional SSO config (issuer, client ID, audience) |
| `users`             | Org members with role (`admin` / `user`) and optional password hash |
| `policies`          | Versioned org policies (tools, skills, audit level, kill switch)    |
| `skill_submissions` | Skill review queue with security scan results                       |
| `approved_skills`   | Approved skills per org, with optional per-user scope               |
| `audit_events`      | Tool calls, session lifecycle, LLM I/O events                       |
| `client_heartbeats` | Last heartbeat timestamp per user per org                           |
| `enrollment_tokens` | Admin-generated tokens for user onboarding                          |

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

| Column       | Type        | Description                        |
| ------------ | ----------- | ---------------------------------- |
| `id`         | UUID (PK)   | Auto-generated                     |
| `name`       | TEXT        | Org display name                   |
| `sso_config` | JSONB       | `{issuerUrl, clientId, audience?}` |
| `created_at` | TIMESTAMPTZ |                                    |
| `updated_at` | TIMESTAMPTZ |                                    |

#### `users`

| Column          | Type                      | Description                           |
| --------------- | ------------------------- | ------------------------------------- |
| `id`            | UUID (PK)                 | Auto-generated                        |
| `org_id`        | UUID (FK → organizations) |                                       |
| `email`         | TEXT                      | Unique per org                        |
| `name`          | TEXT                      | From OIDC claims or enrollment        |
| `role`          | TEXT                      | `admin` or `user`                     |
| `password_hash` | TEXT                      | Bcrypt hash (null for SSO-only users) |
| `last_seen_at`  | TIMESTAMPTZ               | Updated on auth                       |
| `created_at`    | TIMESTAMPTZ               |                                       |

Unique index: `(org_id, email)`

#### `policies`

| Column                | Type              | Description                     |
| --------------------- | ----------------- | ------------------------------- |
| `id`                  | UUID (PK)         | Auto-generated                  |
| `org_id`              | UUID (FK, unique) | One policy per org              |
| `version`             | INT               | Incremented on each update      |
| `tools_config`        | JSONB             | `{allow?, deny?, profile?}`     |
| `skills_config`       | JSONB             | `{requireApproval, approved[]}` |
| `kill_switch`         | BOOLEAN           |                                 |
| `kill_switch_message` | TEXT              | Shown to users when active      |
| `audit_level`         | TEXT              | `full`, `metadata`, or `off`    |
| `updated_at`          | TIMESTAMPTZ       |                                 |

#### `skill_submissions`

| Column             | Type              | Description                                            |
| ------------------ | ----------------- | ------------------------------------------------------ |
| `id`               | UUID (PK)         |                                                        |
| `org_id`           | UUID (FK)         |                                                        |
| `submitted_by`     | UUID (FK → users) |                                                        |
| `skill_name`       | TEXT              |                                                        |
| `skill_key`        | TEXT              | Optional unique key                                    |
| `metadata`         | JSONB             | Arbitrary key-value data                               |
| `manifest_content` | TEXT              | Full SKILL.md content                                  |
| `scan_results`     | JSONB             | `{scannedFiles, critical, warn, info, findings[]}`     |
| `status`           | TEXT              | `pending`, `approved-org`, `approved-self`, `rejected` |
| `reviewed_by`      | UUID (FK → users) |                                                        |
| `review_notes`     | TEXT              |                                                        |
| `created_at`       | TIMESTAMPTZ       |                                                        |
| `updated_at`       | TIMESTAMPTZ       |                                                        |

Index: `(org_id, status)`

#### `approved_skills`

| Column              | Type              | Description          |
| ------------------- | ----------------- | -------------------- |
| `id`                | UUID (PK)         |                      |
| `org_id`            | UUID (FK)         |                      |
| `skill_name`        | TEXT              |                      |
| `skill_key`         | TEXT              |                      |
| `scope`             | TEXT              | `org` or `self`      |
| `approved_for_user` | UUID (FK → users) | Set for `self` scope |
| `created_at`        | TIMESTAMPTZ       |                      |

Index: `(org_id)`

#### `audit_events`

| Column        | Type        | Description                                                    |
| ------------- | ----------- | -------------------------------------------------------------- |
| `id`          | UUID        |                                                                |
| `org_id`      | UUID (FK)   |                                                                |
| `user_id`     | UUID        |                                                                |
| `event_type`  | TEXT        | `tool_call_attempt`, `tool_call_result`, `session_start`, etc. |
| `tool_name`   | TEXT        | For tool-related events                                        |
| `outcome`     | TEXT        | `allowed`, `blocked`, `error`, `success`                       |
| `agent_id`    | TEXT        |                                                                |
| `session_key` | TEXT        |                                                                |
| `metadata`    | JSONB       |                                                                |
| `timestamp`   | TIMESTAMPTZ | Event time                                                     |

Indexes: `(org_id, timestamp)`, `(org_id, user_id)`. Partitioned by range on `timestamp` (after migration 0001).

#### `client_heartbeats`

| Column              | Type              | Description |
| ------------------- | ----------------- | ----------- |
| `id`                | UUID (PK)         |             |
| `org_id`            | UUID (FK)         |             |
| `user_id`           | UUID (FK → users) |             |
| `last_heartbeat_at` | TIMESTAMPTZ       |             |
| `client_version`    | TEXT              |             |

Unique index: `(org_id, user_id)` — upserted on each heartbeat.

#### `enrollment_tokens`

| Column       | Type                      | Description                     |
| ------------ | ------------------------- | ------------------------------- |
| `id`         | UUID (PK)                 | Auto-generated                  |
| `org_id`     | UUID (FK → organizations) |                                 |
| `token`      | TEXT (unique)             | Base64url token string          |
| `label`      | TEXT                      | Optional human-readable label   |
| `expires_at` | TIMESTAMPTZ               | Optional expiry                 |
| `max_uses`   | INT                       | Optional usage cap              |
| `used_count` | INT                       | Current usage count (default 0) |
| `created_by` | UUID (FK → users)         | Admin who created the token     |
| `revoked_at` | TIMESTAMPTZ               | Set when revoked                |
| `created_at` | TIMESTAMPTZ               |                                 |

Indexes: `(org_id)`, unique on `(token)`
