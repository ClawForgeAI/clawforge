# ClawForge — Features to Adapt from Mission Control

Analysis of [openclaw-mission-control](https://github.com/abhi1693/openclaw-mission-control) features that would strengthen ClawForge's enterprise governance capabilities.

---

## High Priority — Direct Fit

### 1. Gateway Management UI

**What Mission Control has:**
- CRUD for gateway records (register, update, delete)
- Gateway status/health monitoring from the admin panel
- Template synchronization to push config to connected gateways
- RPC communication with live gateways (session inspection, command dispatch)

**Why ClawForge needs it:**
Currently ClawForge's plugin connects to one control plane, but there's no way to see which gateways are connected, their health, or push policy updates proactively. The admin is blind to fleet status.

**Adapt as:**
- Gateway registry page — list connected gateways with last heartbeat, client version, policy version
- Gateway health dashboard — which gateways are online, stale, or unreachable
- Push policy refresh — trigger immediate policy sync instead of waiting for next heartbeat
- Gateway detail view — see active sessions, loaded skills, enforced policy version

---

### 2. Approval Workflows (Generalized)

**What Mission Control has:**
- Approval model with `pending → approved → rejected` lifecycle
- Confidence scores and rubric scoring on approvals
- Agent-initiated approvals (AI requests human sign-off)
- SSE streaming for real-time approval status
- Task-linked approvals with conflict detection
- Lead reasoning requirement on each approval

**Why ClawForge needs it:**
ClawForge currently only has skill approval. But enterprise governance needs broader approval flows — e.g., approving a tool policy change, approving a temporary tool unlock for a user, approving elevated access.

**Adapt as:**
- Generalized approval system: skill approvals become one type
- New approval types: policy change requests, temporary tool access requests, kill switch deactivation requests
- Confidence/reasoning fields — useful when an AI agent requests elevated access
- Real-time SSE notifications when approvals are pending (admin gets instant alerts)
- Approval audit trail — every approval/rejection logged with reviewer, reasoning, timestamp

---

### 3. Activity Feed / Timeline

**What Mission Control has:**
- `ActivityEvent` model tracking all system actions
- Activity API with SSE streaming for real-time updates
- Filterable by board, time range, event type
- Task comment feed (interleaved activity + comments)

**Why ClawForge needs it:**
ClawForge has audit logs, but they're raw event records. An activity feed is a human-readable timeline — "Admin X activated kill switch", "User Y submitted skill Z", "Policy updated to v5". Much more usable for ops teams.

**Adapt as:**
- Activity feed page in admin UI — chronological, filterable, real-time
- SSE endpoint for live streaming (admin sees events as they happen)
- Human-readable event descriptions (not just raw `tool_call_attempt` records)
- Filter by: user, event category (policy, skill, kill switch, auth), time range

---

### 4. Dashboard Metrics & KPIs

**What Mission Control has:**
- Dashboard metrics API with time-range aggregation (24h, 7d, 30d, 90d)
- KPI cards (counts, rates)
- Sparkline charts with time-bucketed series
- WIP (work-in-progress) tracking

**Why ClawForge needs it:**
ClawForge's dashboard page exists but likely shows basic counts. Enterprise admins need:

**Adapt as:**
- Tool usage metrics — most-called tools, blocked vs allowed ratio, trend over time
- User activity metrics — active users, sessions per day, tools per session
- Security metrics — blocked tool calls, kill switch activations, policy violations
- Skill metrics — submissions pending, approval rate, most-used skills
- Time-series charts with configurable ranges (24h / 7d / 30d)

---

### 5. Organization Management

**What Mission Control has:**
- Full org CRUD with member management
- Org invites with accept/reject flow
- Board-level access control per member
- Member role updates (admin/member)
- Org switching (multi-org support)
- Active/inactive org toggle

**Why ClawForge needs it:**
ClawForge orgs must be created via raw SQL. No invite flow, no role management, no multi-org UI.

**Adapt as:**
- Org creation page in admin console
- Invite flow — admin generates invite link/code, user accepts to join org
- Member management — list, update role (admin/user), remove
- Multi-org support — user can belong to multiple orgs, switch between them
- Org settings page — SSO config, default policy, audit level

---

## Medium Priority — Valuable Additions

### 6. Agent Management

**What Mission Control has:**
- Agent registry with lifecycle management (create, inspect, update, delete)
- Agent heartbeats with health tracking
- Agent-to-board assignment
- Agent token management

**Why ClawForge needs it:**
In multi-gateway environments, knowing which AI agents exist, their health, and what they're doing is essential for governance.

**Adapt as:**
- Agent registry — list agents across gateways with status
- Agent-level policy overrides — restrict specific agents differently
- Agent activity view — what tools an agent has called, how many sessions
- Agent health — last seen, gateway association

---

### 7. Webhooks

**What Mission Control has:**
- Board webhook CRUD (create endpoints, configure triggers)
- Inbound payload ingestion with queued delivery
- Webhook payload history

**Why ClawForge needs it:**
Enterprise integrations need webhook notifications — e.g., notify Slack when kill switch activates, trigger PagerDuty on policy violation, send audit events to SIEM.

**Adapt as:**
- Outbound webhook configuration — admin configures URLs + events to notify
- Event triggers: kill switch activated, policy updated, skill submitted, blocked tool call threshold exceeded
- Webhook delivery log with retry tracking
- Webhook secret/signature for verification

---

### 8. Board/Task Concept → Policy Groups

**What Mission Control has:**
- Board groups → Boards → Tasks hierarchy
- Tags for categorization
- Task dependencies and custom fields
- Task fingerprinting (deduplication)

**Why ClawForge needs it (adapted):**
Not tasks literally, but the concept of **policy groups** — grouping gateways or users under different policy sets.

**Adapt as:**
- Policy groups — group users/gateways under named policy profiles (e.g., "Engineering", "Finance", "Contractors")
- Group-level overrides — different tool access per group
- Tags on policies, skills, users for filtering
- Custom fields on audit events for org-specific metadata

---

### 9. Skills Marketplace

**What Mission Control has:**
- Marketplace skill registry with CRUD
- Skill packs (bundles of skills from git repos)
- Install/uninstall skills to gateways
- Skill pack sync from git sources
- Per-gateway installed skill tracking

**Why ClawForge needs it:**
ClawForge has skill submission/approval but no marketplace or distribution. Once approved, there's no mechanism to install skills across multiple gateways.

**Adapt as:**
- Internal skill catalog — approved skills browsable by users
- Skill distribution — push approved skills to selected gateways
- Skill versioning — track which version is deployed where
- Skill pack bundles — group related skills for batch deployment

---

## Lower Priority — Nice to Have

### 10. SSE Real-Time Streaming

**What Mission Control has:**
- SSE streaming on approvals, activity, agent events
- Poll-based SSE with configurable intervals

**Adapt as:**
- SSE for audit events (live tail in admin UI)
- SSE for kill switch state changes (instant propagation, replacing heartbeat-only approach)
- SSE for pending skill approvals (admin notification)

---

### 11. Docker-First Deployment

**What Mission Control has:**
- `docker compose` with full stack (frontend + backend + DB)
- Interactive install script
- `.env.example` templates for all services

**Adapt as:**
- Dockerfile for clawguard-server
- Dockerfile for clawguard-admin
- `docker-compose.yml` for full stack (server + admin + PostgreSQL)
- Install script for guided setup

---

### 12. Board Memory / Context

**What Mission Control has:**
- Board-level memory (persistent context per board)
- Board group memory (shared across boards in a group)
- Board onboarding sessions

**Adapt as:**
- Policy context/notes — admins can attach notes to policies explaining rationale
- Org-level shared context — onboarding docs, security guidelines visible to all members
- Decision log — why a policy was set, linked to the policy version

---

## Summary — Prioritized Implementation Order

| # | Feature | Effort | Impact |
|---|---|---|---|
| 1 | Organization management (CRUD, invites, roles) | Medium | High |
| 2 | Activity feed with real-time SSE | Medium | High |
| 3 | Dashboard metrics & KPIs | Medium | High |
| 4 | Gateway management UI | Medium | High |
| 5 | Generalized approval workflows | Large | High |
| 6 | Outbound webhooks | Medium | Medium |
| 7 | Agent registry | Medium | Medium |
| 8 | Skills marketplace / distribution | Large | Medium |
| 9 | Policy groups | Medium | Medium |
| 10 | Docker deployment | Small | Medium |
| 11 | SSE real-time streaming | Small | Low |
| 12 | Policy context / decision log | Small | Low |
