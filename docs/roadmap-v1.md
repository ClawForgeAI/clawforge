# ClawForge v1.0.0 Roadmap — Must-Have Governance Platform

## Vision Alignment

v1.0.0 is defined by the 8 **must-have platform capabilities** from the [ClawForge vision](../clawforge-hq/knowledge-base/vision.md). Every feature in this roadmap maps directly to one of these capabilities. Orchestration and advanced features (cross-client memory, smart routing, skill marketplace, event triggers) are deferred to v1.x.

**Release gate**: Multi-org, horizontally scalable, with all 8 governance capabilities production-ready. Validated by 2-3 real orgs with no critical bugs.

---

## Release Strategy (Updated)

```
v0.1.x  Foundation        <- Complete (core platform shipped)
  |
v0.2.0  Production Ready  <- Deploy safely (infra, observability, ops)
  |
v0.3.0  Enterprise Gov    <- Enterprise governance gaps (partially promoted to v1)
  |
v0.4.0  Visibility        <- Deep insights (partially promoted to v1)
  |
v0.5.0  Admin Experience  <- Daily delight (UX, search, shortcuts)
  |
v1.0.0  General Avail     <- 8 must-have capabilities, multi-org, scaling
  |
v1.x    Orchestration     <- Cross-client memory, smart routing, marketplace, triggers
```

---

## Weekly Release Issue List (GitHub Snapshot)

_Last verified against GitHub issues and milestones on **April 22, 2026**._

### Week 1 Release — v0.3.0 Enterprise Governance (6 open)

- [#64](https://github.com/ClawForgeAI/clawforge/issues/64) — Instance grouping & tagging for fleet organization
- [#62](https://github.com/ClawForgeAI/clawforge/issues/62) — Policy change audit trail & approval workflow
- [#60](https://github.com/ClawForgeAI/clawforge/issues/60) — API key management for external integrations
- [#57](https://github.com/ClawForgeAI/clawforge/issues/57) — Gateway crash & restart event tracking
- [#56](https://github.com/ClawForgeAI/clawforge/issues/56) — Fleet-wide version compliance enforcement
- [#53](https://github.com/ClawForgeAI/clawforge/issues/53) — Prompt injection detection in audit logs

### Week 2 Release — v0.4.0 Visibility & Intelligence (9 open)

- [#82](https://github.com/ClawForgeAI/clawforge/issues/82) — Audit log real-time streaming view (SSE/WebSocket)
- [#70](https://github.com/ClawForgeAI/clawforge/issues/70) — Risk-level authorization tiers for tool access
- [#69](https://github.com/ClawForgeAI/clawforge/issues/69) — Per-session cost tracking aggregation across fleet
- [#67](https://github.com/ClawForgeAI/clawforge/issues/67) — Session recording & replay for incident investigation
- [#65](https://github.com/ClawForgeAI/clawforge/issues/65) — Compliance report generation (SOC2, ISO 27001)
- [#59](https://github.com/ClawForgeAI/clawforge/issues/59) — Auth profile & credential rotation policy
- [#55](https://github.com/ClawForgeAI/clawforge/issues/55) — Channel health monitoring per instance
- [#54](https://github.com/ClawForgeAI/clawforge/issues/54) — Model usage & fallback visibility dashboard
- [#34](https://github.com/ClawForgeAI/clawforge/issues/34) — Cost tracking & budget enforcement

### Week 3 Release — v0.5.0 Admin Experience (10 open)

- [#81](https://github.com/ClawForgeAI/clawforge/issues/81) — Bulk operations on instances (multi-select actions)
- [#80](https://github.com/ClawForgeAI/clawforge/issues/80) — Keyboard shortcuts for admin console power users
- [#79](https://github.com/ClawForgeAI/clawforge/issues/79) — Dark mode support for admin console
- [#78](https://github.com/ClawForgeAI/clawforge/issues/78) — Global search across audit logs, users, and policies
- [#72](https://github.com/ClawForgeAI/clawforge/issues/72) — Cron job governance and visibility
- [#71](https://github.com/ClawForgeAI/clawforge/issues/71) — Prompt caching policy controls
- [#68](https://github.com/ClawForgeAI/clawforge/issues/68) — Plugin configuration distribution via control plane
- [#63](https://github.com/ClawForgeAI/clawforge/issues/63) — Scheduled policy activation (time-based rules)
- [#58](https://github.com/ClawForgeAI/clawforge/issues/58) — Post-restart task continuation governance
- [#50](https://github.com/ClawForgeAI/clawforge/issues/50) — Slack/Teams integration for admin notifications

### Week 4 Release — v1.0.0 General Availability Backlog (10 open)

- [#77](https://github.com/ClawForgeAI/clawforge/issues/77) — Horizontal scaling: stateless server mode with external session store
- [#49](https://github.com/ClawForgeAI/clawforge/issues/49) — Terraform/Pulumi provider for policy-as-code
- [#48](https://github.com/ClawForgeAI/clawforge/issues/48) — Multi-org management UI and org creation flow
- [#37](https://github.com/ClawForgeAI/clawforge/issues/37) — Backup & restore: one-click agent state export/import
- [#36](https://github.com/ClawForgeAI/clawforge/issues/36) — Event-driven triggers across clients
- [#35](https://github.com/ClawForgeAI/clawforge/issues/35) — Shared skill marketplace (private/org-scoped)
- [#33](https://github.com/ClawForgeAI/clawforge/issues/33) — Per-context profiles (work mode / personal mode)
- [#32](https://github.com/ClawForgeAI/clawforge/issues/32) — Smart routing / task delegation across fleet
- [#31](https://github.com/ClawForgeAI/clawforge/issues/31) — Cross-client memory/context sharing
- [#30](https://github.com/ClawForgeAI/clawforge/issues/30) — Multi-agent orchestration dashboard

---

## Must-Have Capabilities Overview

| #   | Capability                           | Shipped                                                     | Remaining Issues                    | New Issues        |
| --- | ------------------------------------ | ----------------------------------------------------------- | ----------------------------------- | ----------------- |
| 1   | Identity & Access Control            | SSO/OIDC, RBAC (6 roles), enrollment tokens, API keys       | #48, #60, #162                      | 5 new             |
| 2   | Agent Registry & Runtime Abstraction | None (OpenClaw-only)                                        | #148-#151, #155, #164/166           | 3 new             |
| 3   | Policy Engine                        | Tool allow/deny (11 groups), DLP, multi-policy, kill switch | #49, #62, #86, #90, #152-#154, #160 | 3 new             |
| 4   | Approval Workflows                   | Skill approval only                                         | #62, #88                            | 7 new (full epic) |
| 5   | Audit Trail                          | 3-level audit, batch ingestion, CSV/JSON export, retention  | #82, #161                           | 3 new             |
| 6   | Kill Switch & Emergency Controls     | Org-wide kill switch, SSE, heartbeat fallback               | --                                  | 2 new             |
| 7   | Session Visibility & Observability   | Client status, heartbeat, alerts, anomaly detection         | #55, #56, #57, #64, #82, #89        | 3 new             |
| 8   | Tool & Connector Governance          | Tool allow/deny, DLP, skill governance                      | #85, #91, #92, #93, #163            | 2 new             |

---

## Milestone Restructuring

### Demoted to v1.x -- Orchestration

| Issue                                                     | Title                                         | Reason                         |
| --------------------------------------------------------- | --------------------------------------------- | ------------------------------ |
| [#30](https://github.com/ClawForgeAI/clawforge/issues/30) | Multi-agent orchestration dashboard           | Orchestration, not governance  |
| [#31](https://github.com/ClawForgeAI/clawforge/issues/31) | Cross-client memory/context sharing           | Orchestration                  |
| [#32](https://github.com/ClawForgeAI/clawforge/issues/32) | Smart routing / task delegation across fleet  | Orchestration                  |
| [#33](https://github.com/ClawForgeAI/clawforge/issues/33) | Per-context profiles (work/personal mode)     | UX convenience, not governance |
| [#35](https://github.com/ClawForgeAI/clawforge/issues/35) | Shared skill marketplace (private/org-scoped) | Marketplace, not governance    |
| [#36](https://github.com/ClawForgeAI/clawforge/issues/36) | Event-driven triggers across clients          | Orchestration                  |

### Promoted into v1.0.0

| Issue                                                       | From    | Title                                         | Capability         |
| ----------------------------------------------------------- | ------- | --------------------------------------------- | ------------------ |
| [#55](https://github.com/ClawForgeAI/clawforge/issues/55)   | v0.4.0  | Channel health monitoring per instance        | Session Visibility |
| [#56](https://github.com/ClawForgeAI/clawforge/issues/56)   | v0.3.0  | Fleet-wide version compliance enforcement     | Session Visibility |
| [#57](https://github.com/ClawForgeAI/clawforge/issues/57)   | v0.3.0  | Gateway crash & restart event tracking        | Session Visibility |
| [#60](https://github.com/ClawForgeAI/clawforge/issues/60)   | v0.3.0  | API key management for external integrations  | Identity           |
| [#62](https://github.com/ClawForgeAI/clawforge/issues/62)   | v0.3.0  | Policy change audit trail & approval workflow | Approval Workflows |
| [#64](https://github.com/ClawForgeAI/clawforge/issues/64)   | v0.3.0  | Instance grouping & tagging                   | Session Visibility |
| [#82](https://github.com/ClawForgeAI/clawforge/issues/82)   | v0.4.0  | Audit log real-time streaming (SSE/WebSocket) | Audit Trail        |
| [#152](https://github.com/ClawForgeAI/clawforge/issues/152) | phase-3 | EU AI Act compliance policy template          | Policy Engine      |
| [#153](https://github.com/ClawForgeAI/clawforge/issues/153) | phase-3 | NIST AI RMF and ISO 42001 templates           | Policy Engine      |
| [#154](https://github.com/ClawForgeAI/clawforge/issues/154) | phase-3 | Regulatory mapping documentation              | Policy Engine      |
| [#155](https://github.com/ClawForgeAI/clawforge/issues/155) | phase-3 | Agent registry with metadata cards            | Agent Registry     |

### Unlabeled issues assigned

| Issue                                                     | Title                           | Capability                  | Milestone |
| --------------------------------------------------------- | ------------------------------- | --------------------------- | --------- |
| [#85](https://github.com/ClawForgeAI/clawforge/issues/85) | Channel governance              | Tool & Connector Governance | v1.0.0    |
| [#86](https://github.com/ClawForgeAI/clawforge/issues/86) | Model & provider governance     | Policy Engine               | v1.0.0    |
| [#87](https://github.com/ClawForgeAI/clawforge/issues/87) | Group & DM chat access policies | Tool & Connector Governance | v1.x      |
| [#88](https://github.com/ClawForgeAI/clawforge/issues/88) | Exec approval policy            | Approval Workflows          | v1.0.0    |
| [#89](https://github.com/ClawForgeAI/clawforge/issues/89) | Session visibility controls     | Session Visibility          | v1.0.0    |
| [#90](https://github.com/ClawForgeAI/clawforge/issues/90) | Subagent tool restrictions      | Policy Engine               | v1.0.0    |
| [#91](https://github.com/ClawForgeAI/clawforge/issues/91) | Centralized skill governance    | Tool & Connector Governance | v1.0.0    |
| [#92](https://github.com/ClawForgeAI/clawforge/issues/92) | Plugin & extension governance   | Tool & Connector Governance | v1.0.0    |
| [#93](https://github.com/ClawForgeAI/clawforge/issues/93) | Gateway HTTP tool policy        | Tool & Connector Governance | v1.0.0    |

### Duplicate issues to close

| Issue                                                       | Duplicate of | Title                                         |
| ----------------------------------------------------------- | ------------ | --------------------------------------------- |
| [#165](https://github.com/ClawForgeAI/clawforge/issues/165) | #160         | Refactor OpenClaw plugin onto shared packages |
| [#167](https://github.com/ClawForgeAI/clawforge/issues/167) | #164         | Introduce agent-sdk package                   |

---

## Execution Tracks

### Track 0: Platform Foundation (Weeks 1-3)

Phase-1 extraction -- shared packages that unblock every other track.

#### What's shipped

- Monorepo with plugin/, server/, admin/ packages
- Plugin contains all governance logic inline (policy, audit, auth, DLP)

#### Issues (v1 prerequisites)

| Issue                                                       | Title                                        | Area     | Dependencies | Description                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------------------------------------- | -------- | ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#158](https://github.com/ClawForgeAI/clawforge/issues/158) | Scaffold shared workspace packages           | Infra    | None         | Create `packages/` directory with `contracts`, `policy-engine`, `audit-events`, `auth`, `tool-governance`, `agent-sdk` package stubs. Configure pnpm workspace, tsconfig paths, tsup builds. |
| [#159](https://github.com/ClawForgeAI/clawforge/issues/159) | Extract shared contracts package             | Packages | #158         | Move `OrgPolicy`, `HeartbeatResponse`, `AuditEvent`, `DLPRule`, `SkillSubmission` types to `@clawforgeai/contracts`. All packages import from here.                                          |
| [#146](https://github.com/ClawForgeAI/clawforge/issues/146) | Extract @clawforgeai/core from plugin        | Plugin   | #158         | Extract DLP scanner, policy engine, audit buffer, connection state into `@clawforgeai/core`. Plugin becomes a thin adapter.                                                                  |
| [#160](https://github.com/ClawForgeAI/clawforge/issues/160) | Extract reusable policy engine               | Packages | #159         | Move tool-enforcer logic, group expansion, allow/deny evaluation into `@clawforgeai/policy-engine`. Pure functions, no OpenClaw dependency.                                                  |
| [#161](https://github.com/ClawForgeAI/clawforge/issues/161) | Extract audit events package                 | Packages | #159         | Move audit event types, batching logic, and serialization to `@clawforgeai/audit-events`.                                                                                                    |
| [#162](https://github.com/ClawForgeAI/clawforge/issues/162) | Extract shared auth/identity package         | Packages | #159         | Move token management, SSO helpers, enrollment token handling to `@clawforgeai/auth`.                                                                                                        |
| [#163](https://github.com/ClawForgeAI/clawforge/issues/163) | Introduce tool-governance package            | Packages | #159, #160   | Shared capability metadata, tool classification, governance rule types. Used by policy engine and adapters.                                                                                  |
| [#164](https://github.com/ClawForgeAI/clawforge/issues/164) | Introduce agent-sdk package                  | Packages | #159, #160   | Runtime lifecycle contract: `registerAgent()`, `startRun()`, `cancelRun()`, `requestApproval()`, `emitEvent()`. Base adapter class.                                                          |
| [#166](https://github.com/ClawForgeAI/clawforge/issues/166) | Introduce agent-sdk (runtime lifecycle)      | Packages | #159, #160   | Same scope as #164 -- consolidate if duplicate.                                                                                                                                              |
| [#147](https://github.com/ClawForgeAI/clawforge/issues/147) | Refactor OpenClaw plugin to import from core | Plugin   | #146         | Replace inline logic with imports from `@clawforgeai/core`. All existing tests must pass. Zero behavior change.                                                                              |

#### Completion criteria

- All packages build independently (`pnpm --filter @clawforgeai/<pkg> build`)
- OpenClaw plugin works identically with extracted packages
- CI passes with new package structure

---

### Track 1: Identity & Agent Registry (Weeks 3-6)

Build multi-agent identity, agent registry, and Claude Code support.

#### What's shipped

- SSO/OIDC auth with browser-open flow
- 6 RBAC roles: super_admin, admin, policy_admin, security_admin, viewer, user
- 17 granular permissions across 9 resources
- Enrollment tokens for org joining
- JWT refresh tokens
- API key authentication (tied to users)

#### Existing issues

| Issue                                                       | Title                                         | Area   | Dependencies          | Description                                                                                                                                                    |
| ----------------------------------------------------------- | --------------------------------------------- | ------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#148](https://github.com/ClawForgeAI/clawforge/issues/148) | Build Claude Code adapter                     | Plugin | #164                  | `@clawforgeai/claude-code` package. Implements agent-sdk lifecycle using Claude Code HTTP hooks. Registers with server, enforces policies, emits audit events. |
| [#149](https://github.com/ClawForgeAI/clawforge/issues/149) | Stateless policy enforce endpoint             | Server | #160                  | `POST /api/v1/enforce` -- receives tool call context, evaluates policy, returns allow/deny/requires_approval. Used by adapters that can't embed the engine.    |
| [#150](https://github.com/ClawForgeAI/clawforge/issues/150) | clawforge-cc init CLI                         | CLI    | #148                  | CLI command for Claude Code users to set up ClawForge. Generates hooks config, enrollment, tests connection.                                                   |
| [#151](https://github.com/ClawForgeAI/clawforge/issues/151) | Show Claude Code clients in admin dashboard   | Admin  | #148                  | Extend connected clients view to display Claude Code instances with agent type indicator.                                                                      |
| [#155](https://github.com/ClawForgeAI/clawforge/issues/155) | Agent registry with metadata cards            | Admin  | NEW: Registry API     | Admin page with rich cards per registered agent: type, version, status, last seen, policy applied, tool count.                                                 |
| [#48](https://github.com/ClawForgeAI/clawforge/issues/48)   | Multi-org management UI and org creation flow | Admin  | NEW: Teams model      | Create/switch/manage multiple organizations. Org creation wizard with initial admin, SSO config, default policy.                                               |
| [#60](https://github.com/ClawForgeAI/clawforge/issues/60)   | API key management UI                         | Admin  | NEW: Service accounts | Admin page to create/revoke/rotate API keys. Assign to service accounts with scoped permissions. Usage tracking.                                               |

#### New issues

| Title                                                | Area     | Dependencies            | Description                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------------------- | -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agent instance identity model                        | Server   | #162                    | Create `agent_instances` table: `id`, `org_id`, `user_id`, `service_account_id` (nullable), `agent_type` (enum: openclaw, claude_code, codex, copilot, custom), `name`, `version`, `status` (active/suspended/disconnected), `last_seen_at`, `metadata` (JSONB), `registered_at`. Update heartbeat tracking to use instance_id instead of just user_id. Migration + seed. |
| Teams data model: create teams table with membership | Server   | #162                    | Create `teams` table: `id`, `org_id`, `name`, `description`, `created_at`. Create `team_memberships` table: `team_id`, `user_id`, `role` (member/lead), `joined_at`. Add team-based policy assignment to `policy_assignments` table. API routes: `POST/GET/PATCH/DELETE /api/v1/teams`, `POST/DELETE /api/v1/teams/:id/members`.                                          |
| Teams management UI                                  | Admin    | Teams data model        | Admin page: list teams, create team with name/description, add/remove members from dropdown, view team's assigned policies. Accessible from sidebar navigation.                                                                                                                                                                                                           |
| Service account entity model                         | Server   | #162                    | Create `service_accounts` table: `id`, `org_id`, `name`, `description`, `status` (active/suspended), `permissions` (JSONB array of scoped permission strings), `created_by`, `created_at`. Modify `api_keys` table to add `service_account_id` foreign key (nullable, for backward compat). API routes: `POST/GET/PATCH/DELETE /api/v1/service-accounts`.                 |
| SAML/SSO readiness: extend auth for SAML 2.0         | Server   | #162                    | Extend `sso_configs` table with `saml_metadata_url`, `saml_entity_id`, `saml_acs_url`, `saml_certificate`. Add SAML assertion consumer endpoint at `POST /api/v1/auth/saml/callback`. Parse SAML response, map attributes to user. Schema and endpoint stubs -- full SAML flow tested with mock IdP.                                                                      |
| Agent registry: data model and CRUD API              | Server   | Agent instance identity | Create `agent_runtimes` table: `id`, `org_id`, `name`, `type` (enum), `version`, `status` (active/suspended/deprecated), `description`, `capabilities` (JSONB: supported tools, hooks, protocols), `config_schema` (JSONB), `registered_at`, `updated_at`. CRUD routes at `/api/v1/agent-runtimes`. Agents auto-register on first heartbeat if not already registered.    |
| Agent registry admin UI                              | Admin    | Agent registry API      | New admin page: `/agent-registry`. List registered runtimes as cards with type icon, name, version, status badge, instance count, last activity. Actions: suspend, activate, view instances, edit metadata. Filter by type, status.                                                                                                                                       |
| Runtime lifecycle contract types                     | Packages | #159, #164              | Define and publish canonical TypeScript interfaces in `@clawforgeai/contracts`: `AgentRuntime`, `AgentInstance`, `RunSession`, `ApprovalRequest`. Lifecycle methods: `register()`, `startRun()`, `endRun()`, `cancelRun()`, `requestApproval()`, `emitAuditEvent()`, `listTools()`, `getPolicy()`. These are the contracts all adapters implement.                        |

#### Completion criteria

- Claude Code adapter registers, enforces policy, and appears in admin dashboard
- Agent registry shows all registered runtimes with metadata cards
- Teams can be created and assigned policies
- Service accounts can be created with scoped API keys
- Multi-org creation flow works end-to-end

---

### Track 2: Policy Engine Hardening (Weeks 4-7)

Deepen policy engine to cover all governance surfaces described in the vision.

#### What's shipped

- Tool allow/deny lists with 11 capability groups
- Group expansion (e.g., `group:fs` -> read, write, edit, apply_patch)
- Shell command interception
- DLP rules with block/warn/log actions
- Multiple named policies with priority resolution
- User and role-based policy assignment
- Kill switch per policy
- Audit level configuration per policy

#### Existing issues

| Issue                                                       | Title                                         | Area          | Dependencies  | Description                                                                                                                                                                                               |
| ----------------------------------------------------------- | --------------------------------------------- | ------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#86](https://github.com/ClawForgeAI/clawforge/issues/86)   | Model & provider governance                   | Server        | #160          | Add `model_restrictions` to policy: allowed/denied model IDs (e.g., `claude-sonnet-4-20250514`, `gpt-4o`), allowed/denied providers (anthropic, openai, google). Policy engine evaluates model selection. |
| [#90](https://github.com/ClawForgeAI/clawforge/issues/90)   | Subagent tool restrictions                    | Server        | #160          | Add `subagent_policy` to policy schema: which tools spawned sub-agents can access, max nesting depth, whether sub-agents inherit parent policy or get a restricted subset.                                |
| [#85](https://github.com/ClawForgeAI/clawforge/issues/85)   | Channel governance                            | Server        | #163          | Enable/disable messaging channels (Slack, Teams, email) from admin. Per-policy `channel_allowlist` and `channel_denylist`.                                                                                |
| [#91](https://github.com/ClawForgeAI/clawforge/issues/91)   | Centralized skill governance                  | Server        | #163          | Org-wide skill allow/deny list in admin (beyond per-policy). Global skill blocklist that overrides policy-level settings.                                                                                 |
| [#92](https://github.com/ClawForgeAI/clawforge/issues/92)   | Plugin & extension governance                 | Server        | #163          | Control which OpenClaw extensions/plugins are allowed to load. Allowlist by extension ID. Block unapproved extensions org-wide.                                                                           |
| [#93](https://github.com/ClawForgeAI/clawforge/issues/93)   | Gateway HTTP tool policy                      | Server        | #163          | Separate access controls for API/HTTP tool invocations. Per-URL or per-domain allow/deny rules. Rate limits per external endpoint.                                                                        |
| [#62](https://github.com/ClawForgeAI/clawforge/issues/62)   | Policy change audit trail & approval workflow | Server, Admin | #160, Track 3 | Every policy create/update/delete is audited. Policy changes to production policies require approval from a second admin.                                                                                 |
| [#49](https://github.com/ClawForgeAI/clawforge/issues/49)   | Terraform/Pulumi provider for policy-as-code  | Infra         | #160, #159    | IaC provider that maps policy CRUD to Terraform resources. Enables GitOps workflow for policy management. `clawforge_policy`, `clawforge_policy_assignment`, `clawforge_team` resources.                  |
| [#152](https://github.com/ClawForgeAI/clawforge/issues/152) | EU AI Act compliance policy template          | Server        | #160          | Pre-built policy template implementing EU AI Act requirements: mandatory human oversight for high-risk systems, transparency logging, data governance controls. One-click apply.                          |
| [#153](https://github.com/ClawForgeAI/clawforge/issues/153) | NIST AI RMF and ISO 42001 templates           | Server        | #160          | Policy templates for NIST AI Risk Management Framework and ISO/IEC 42001. Maps controls to ClawForge policy fields.                                                                                       |
| [#154](https://github.com/ClawForgeAI/clawforge/issues/154) | Regulatory mapping documentation              | Docs          | #152, #153    | Documentation mapping ClawForge capabilities to specific regulatory requirements. Which ClawForge feature satisfies which compliance control.                                                             |

#### New issues

| Title                                        | Area   | Dependencies      | Description                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------- | ------ | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Environment restriction policies             | Server | #160              | Add `environment_restrictions` to policy schema: `allowed_environments` and `denied_environments` arrays (values: `production`, `staging`, `development`, `ci`, `local`). Policy engine reads environment from agent instance metadata (set during registration). A tool call in a denied environment is blocked. Admin UI: environment selector in policy editor. Migration adds column to `policies` table. |
| Connector restriction policies               | Server | #160, #163        | Add `connector_restrictions` to policy schema: `mcp_server_allowlist`, `mcp_server_denylist`, `api_endpoint_allowlist`, `api_endpoint_denylist`. Each entry is a pattern (exact match or glob). Policy engine evaluates `mcp_call` and `http_request` actions against these lists. Admin UI: connector restriction editor in policy form with pattern input and test button.                                  |
| Policy scope inheritance (org > team > user) | Server | Teams model, #160 | Extend `PolicyService.getEffectivePolicy()` resolution order to: user-specific > team-specific > role-specific > org default. When a user belongs to multiple teams, use the most restrictive policy (deny wins). Add `team_id` to `policy_assignments` table. Update policy assignment UI to show team assignment option.                                                                                    |

#### Completion criteria

- Policy engine evaluates environment, connector, model, subagent, and channel restrictions
- Compliance templates can be applied in one click
- Policy changes produce audit events
- Terraform provider can manage policies via IaC
- Policy inheritance resolves correctly through org > team > user

---

### Track 3: Approval Workflows (Weeks 5-8)

Build the entire human-in-the-loop approval system from scratch. This is the largest new capability.

#### What's shipped

- Skill approval workflow (submit > scan > review > approve/reject) -- limited to skills only, not runtime actions

#### Existing issues

| Issue                                                     | Title                                         | Area          | Dependencies    | Description                                                                                    |
| --------------------------------------------------------- | --------------------------------------------- | ------------- | --------------- | ---------------------------------------------------------------------------------------------- |
| [#62](https://github.com/ClawForgeAI/clawforge/issues/62) | Policy change audit trail & approval workflow | Server, Admin | Approval engine | Policy changes require approval -- implemented using the general approval system.              |
| [#88](https://github.com/ClawForgeAI/clawforge/issues/88) | Exec approval policy                          | Server        | Approval engine | Centralized shell command approval configuration. Specific action type in the approval system. |

#### New issues

| Title                                  | Area             | Dependencies              | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------------------------- | ---------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approval requests data model           | Server           | #159                      | Create `approval_requests` table: `id` (uuid), `org_id`, `requester_id` (user), `agent_instance_id` (nullable), `action_type` (enum: `shell_exec`, `prod_deploy`, `secret_access`, `external_call`, `merge`, `policy_change`, `custom`), `action_target` (string -- the specific command, URL, or resource), `risk_level` (enum: `low`, `medium`, `high`, `critical`), `context` (JSONB -- full context of the request), `status` (enum: `pending`, `approved`, `denied`, `expired`, `auto_approved`), `decided_by` (user, nullable), `decision_note` (text, nullable), `decided_at` (timestamp, nullable), `expires_at` (timestamp), `created_at`. Create `approval_rules` table: `id`, `org_id`, `policy_id`, `action_type`, `condition` (JSONB -- e.g., `{"environment": "production"}`), `requires_approval` (boolean), `auto_approve_after_minutes` (nullable), `required_approver_role` (enum), `created_at`. Migration + seed with sensible defaults. |
| Approval engine service                | Server           | Approval data model, #160 | `ApprovalService` class in `server/src/services/approval-service.ts`. Methods: `checkApprovalRequired(action, context, policy)` -- evaluates approval rules, returns required/not-required. `createRequest(requester, action, context)` -- creates pending request, emits SSE event. `decide(requestId, decision, deciderId, note)` -- approves/denies, emits SSE event. `getExpired()` -- marks expired requests. Cron or on-demand cleanup of expired requests. Integrates with existing `EventBus` for real-time notifications.                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Approval API routes                    | Server           | Approval engine           | Routes at `/api/v1/approvals`: `POST /` -- create approval request (called by adapters via enforce endpoint). `GET /` -- list pending/all approvals with filters (status, action_type, requester). `GET /:id` -- get approval detail with full context. `POST /:id/decide` -- approve or deny with note (requires `security_admin` or `admin` role). `GET /stream` -- SSE endpoint for real-time approval notifications (admin receives new requests, requester receives decisions). Rate limited. Pagination on list endpoint.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Approval workflow admin UI             | Admin            | Approval API              | New admin page: `/approvals`. Pending approvals tab: list of cards with action type icon, requester, target, risk level badge, time remaining. Click to expand full context. Approve/deny buttons with required note field. History tab: past decisions with filters. Real-time: new pending requests appear via SSE without page refresh. Badge count on sidebar navigation for pending count.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Approval integration in policy engine  | Server, Packages | Approval engine, #160     | Extend policy evaluation in `@clawforgeai/policy-engine` to return a third outcome: `{ decision: 'requires_approval', rule: ApprovalRule }` alongside `allow` and `deny`. The stateless enforce endpoint (`POST /api/v1/enforce`) returns this outcome. Adapters receive `requires_approval` and must call the approval API, then block/degrade until a decision arrives. Update `PolicyDecision` type in `@clawforgeai/contracts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Approval client SDK for adapters       | Packages         | Approval engine, #164     | Add to `@clawforgeai/agent-sdk`: `requestApproval(action, context): Promise<ApprovalResult>`. This method: 1) calls `POST /api/v1/approvals` to create the request, 2) subscribes to the SSE stream filtered by request ID, 3) resolves when decision arrives (approved/denied/expired). Adapters call this when policy returns `requires_approval`. The OpenClaw adapter shows a user-facing message ("Waiting for approval..."). The Claude Code adapter pauses the hook response. Timeout configurable.                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Configurable approval rules per policy | Server, Admin    | Approval engine           | Extend the policy editor UI to include an "Approval Rules" section. Per action type: toggle requires_approval, set auto-approve timeout (optional), set required approver role, add conditions (e.g., "only in production", "only for commands matching pattern"). API: `POST/GET/PATCH/DELETE /api/v1/policies/:id/approval-rules`. Rules stored in `approval_rules` table linked to policy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

#### Completion criteria

- Admin can configure which actions require approval per policy
- Agent adapter requests approval and blocks until decision
- Admin UI shows pending approvals with real-time updates
- Approve/deny with notes, full audit trail
- Expired requests auto-denied after timeout
- Shell exec approval (#88) works end-to-end

---

### Track 4: Audit & Observability (Weeks 5-8)

Extend audit system to cover all governance events and build observability dashboards.

#### What's shipped

- `auditEvents` table with org_id, user_id, event_type, tool_name, outcome, metadata
- 3 audit levels (full, metadata, off)
- Batched audit ingestion from plugin
- CSV/JSON export
- Retention policy and cleanup
- Admin audit logging (admin actions)
- DLP violation events
- Anomaly detection alerts (denied tool bursts, DLP violations, off-hours activity)

#### Existing issues

| Issue                                                     | Title                                  | Area          | Dependencies            | Description                                                                                                                               |
| --------------------------------------------------------- | -------------------------------------- | ------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| [#82](https://github.com/ClawForgeAI/clawforge/issues/82) | Audit log real-time streaming          | Server, Admin | #161                    | SSE/WebSocket endpoint for live audit tail. Admin UI with real-time log viewer, pause/resume, filter by event type.                       |
| [#55](https://github.com/ClawForgeAI/clawforge/issues/55) | Channel health monitoring per instance | Server, Admin | Heartbeat               | Per-instance health metrics: message latency, error rate, connection stability. Dashboard widget.                                         |
| [#56](https://github.com/ClawForgeAI/clawforge/issues/56) | Fleet-wide version compliance          | Server, Admin | Heartbeat               | Track agent versions across fleet. Flag instances running outdated/unapproved versions. Compliance percentage metric.                     |
| [#57](https://github.com/ClawForgeAI/clawforge/issues/57) | Gateway crash & restart tracking       | Server        | #161                    | Detect and record agent crashes/restarts from heartbeat gaps. Audit event for `agent_crash`, `agent_restart`. Restart frequency alerting. |
| [#64](https://github.com/ClawForgeAI/clawforge/issues/64) | Instance grouping & tagging            | Server, Admin | Agent instance identity | Tag agent instances with custom labels (team, project, environment). Group view in admin. Filter audit/dashboards by tag.                 |
| [#89](https://github.com/ClawForgeAI/clawforge/issues/89) | Session visibility controls            | Server        | #160                    | Restrict which users/roles can view which agent sessions. Policy-based session access control.                                            |

#### New issues

| Title                                              | Area          | Dependencies                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------- | ------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit events for approval decisions                | Server        | Approval engine, #161        | Add new audit event types: `approval_requested` (who requested, what action, risk level), `approval_granted` (who approved, decision note), `approval_denied` (who denied, decision note), `approval_expired` (which request, timeout duration). Each event links to the `approval_request_id`. These events are always logged regardless of audit level (governance-critical). Update audit event type enum in schema and contracts.                                                     |
| Audit events for policy changes                    | Server        | #161                         | Add audit event types: `policy_created`, `policy_updated`, `policy_deleted`, `policy_assigned`, `policy_unassigned`. Capture: who changed, what changed (diff of old vs new policy fields), which policy, which assignment target. Emit from `PolicyService` CRUD methods. Always logged regardless of audit level.                                                                                                                                                                       |
| Audit events for agent lifecycle                   | Server        | #161, Agent registry         | Add audit event types: `agent_registered`, `agent_suspended`, `agent_activated`, `agent_deregistered`, `run_started`, `run_completed`, `run_failed`, `run_cancelled`. Capture: agent instance ID, agent type, user, duration (for run events), error (for failures). Emitted by agent-sdk adapters via audit ingestion endpoint.                                                                                                                                                          |
| Active runs dashboard                              | Admin, Server | Agent lifecycle events       | New admin page: `/runs`. Table of currently active agent sessions: agent name, type icon, user, started at, duration (live counter), tool call count, last tool called, status (running/waiting for approval/idle). Auto-refreshes via polling or SSE. Click row to drill down into session. Filter by agent type, user, team. Server endpoint: `GET /api/v1/runs?status=active` aggregated from recent audit events grouped by session_key.                                              |
| Session event inspection (drill-down)              | Admin         | Audit events                 | Session detail page: `/runs/:sessionKey`. Timeline view of all events in a session ordered by timestamp. Each event shows: timestamp, event type icon, tool name, outcome (allowed/denied/approval-required), duration, truncated metadata. Expandable rows for full context. Policy decision explanations ("Blocked by policy X: tool Y is in denylist"). Approval events shown inline with decision and approver. Built on `GET /api/v1/audit-events?session_key=:key` with pagination. |
| Agent health dashboard: per-instance health status | Admin         | Agent instance identity, #55 | Extend clients page or new `/agent-health` page. Per-instance metrics: uptime percentage, restart count (last 24h/7d), error rate, last error message, policy sync status (in-sync/stale/failed), version compliance status. Aggregated from heartbeat data and crash events. Color-coded health indicators (green/yellow/red). Sortable by health score.                                                                                                                                 |
| Tool usage pattern visibility dashboard            | Admin         | #161                         | New admin page or dashboard widget: `/tool-usage`. Visualizations: most called tools (bar chart), most blocked tools (bar chart), block rate by tool (percentage), usage over time (line chart), usage by agent type (stacked bar). Data from `GET /api/v1/analytics/tool-usage` endpoint that aggregates audit events. Time range selector (24h, 7d, 30d). Filter by agent type, user, team.                                                                                             |

#### Completion criteria

- All governance events (approvals, policy changes, agent lifecycle) produce audit records
- Real-time audit streaming works in admin
- Active runs visible with drill-down into session timelines
- Agent health dashboard shows per-instance status
- Tool usage patterns visible with filtering
- Fleet version compliance tracked and displayed

---

### Track 5: Emergency Controls & Infrastructure (Weeks 6-9)

Granular emergency controls beyond the org-wide kill switch, plus infrastructure for GA.

#### What's shipped

- Kill switch per policy (boolean + message)
- Real-time SSE propagation to all connected clients
- Heartbeat-based kill switch detection (fallback)
- Plugin-side kill switch manager with failure threshold
- Admin kill switch UI

#### Existing issues

| Issue                                                     | Title                                       | Area          | Dependencies | Description                                                                                                                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------- | ------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [#77](https://github.com/ClawForgeAI/clawforge/issues/77) | Horizontal scaling: stateless server mode   | Server, Infra | None         | Extract session state to Redis/external store. Server becomes stateless, supports multiple replicas behind load balancer. SSE fan-out via Redis pub/sub. Health check includes Redis connectivity.                       |
| [#37](https://github.com/ClawForgeAI/clawforge/issues/37) | Backup & restore: agent state export/import | Server        | None         | Export org configuration (policies, users, teams, approval rules, agent registry) as JSON/YAML bundle. Import to restore or migrate between instances. CLI command and admin UI button. Excludes audit logs (too large). |

#### New issues

| Title                                                                | Area          | Dependencies                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------- | ------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime quarantine: suspend individual agent instances               | Server, Admin | Agent instance identity        | Extend kill switch from org-wide to per-instance granularity. New field `quarantined` on `agent_instances` table. Admin can quarantine a specific agent instance from the clients list or agent registry. Quarantine propagated via SSE to the specific instance. Quarantined instance receives `{ quarantined: true, message: "..." }` in heartbeat response and SSE events. Adapter stops all tool execution. Admin UI: "Quarantine" button on instance cards with confirmation dialog and reason field. Audit event: `agent_quarantined`, `agent_unquarantined`.                                                                                       |
| Connector isolation: emergency-block specific MCP servers/connectors | Server, Admin | Connector restriction policies | Org-wide emergency block on a specific MCP server or external API endpoint. Separate from per-policy connector restrictions -- this is an emergency override that applies to ALL policies immediately. New `emergency_blocks` table: `id`, `org_id`, `block_type` (mcp_server/api_endpoint), `pattern` (URL/name pattern), `reason`, `created_by`, `created_at`, `active`. API: `POST /api/v1/emergency-blocks`, `DELETE /api/v1/emergency-blocks/:id`. Propagated via SSE to all connected agents. Policy engine checks emergency blocks before policy evaluation. Admin UI: emergency controls section in kill switch page with "Block Connector" form. |

#### Completion criteria

- Individual agent instances can be quarantined without org-wide kill
- Specific connectors can be emergency-blocked across all agents
- Server runs statelessly with external session store
- Org config can be exported and imported

---

## Dependency Graph Summary

```
Track 0: Foundation
  #158 (scaffold)
    -> #159 (contracts)
      -> #160 (policy engine)
      -> #161 (audit events)
      -> #162 (auth)
      -> #163 (tool governance)
      -> #164 (agent SDK)
    -> #146 (core extraction)
      -> #147 (plugin refactor)

Track 1: Identity & Registry (needs #162, #159, #164)
  Agent instance identity -> Agent registry API -> Registry UI
  Teams model -> Teams UI -> Policy scope inheritance
  Service accounts -> API key management UI
  Claude Code adapter (#148) -> CLI (#150) -> Dashboard (#151)

Track 2: Policy Hardening (needs #160, #163)
  Environment restrictions -> Connector restrictions -> MCP governance
  Model governance (#86) -> Subagent restrictions (#90)
  Channel/plugin/skill/HTTP governance (#85, #91, #92, #93)
  Compliance templates (#152, #153, #154)
  Terraform provider (#49)

Track 3: Approval Workflows (needs #159, #160, #164)
  Data model -> Engine service -> Policy integration
  API routes -> Admin UI
  SDK for adapters -> Approval rules config
  Exec approval (#88) -> Policy change approval (#62)

Track 4: Audit & Observability (needs #161, agent instance identity)
  Approval audit events -> Policy change audit -> Lifecycle audit
  Real-time streaming (#82) -> Active runs dashboard
  Session drill-down -> Agent health dashboard
  Crash tracking (#57) -> Version compliance (#56) -> Instance tagging (#64)

Track 5: Emergency & Infrastructure (needs agent instance identity)
  Runtime quarantine -> Connector isolation
  Horizontal scaling (#77)
  Backup & restore (#37)
```

---

## Total Issue Count

| Category                       | Count                                                                                   |
| ------------------------------ | --------------------------------------------------------------------------------------- |
| Kept from current v1.0.0       | 4 (#37, #48, #49, #77)                                                                  |
| Phase-1 prerequisites          | 12 (#146, #147, #148, #149, #150, #151, #158, #159, #160, #161, #162, #163, #164, #166) |
| Promoted from lower milestones | 11 (#55, #56, #57, #60, #62, #64, #82, #152, #153, #154, #155)                          |
| Assigned from unlabeled        | 8 (#85, #86, #88, #89, #90, #91, #92, #93)                                              |
| New issues to create           | 28                                                                                      |
| **Total v1.0.0 issues**        | **63**                                                                                  |
| Demoted to v1.x                | 6 (#30, #31, #32, #33, #35, #36)                                                        |
| Duplicates to close            | 2 (#165, #167)                                                                          |
