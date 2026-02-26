# Roadmap

## Why We Built This

When an organization adopts OpenClaw as its AI assistant:

- Each employee runs their own OpenClaw instance locally on their machine.
- Each instance can call tools (file read/write, shell exec, web fetch, etc.), install skills (third-party plugins), and interact with LLMs.
- Without governance, the org has **zero visibility or control** over what these AI assistants are doing — what tools they call, what data they access, what third-party code they run.
- There is no way to enforce security policies, audit activity, or respond to incidents across the fleet.

ClawForge solves this by providing a single admin panel that connects to every employee's OpenClaw instance and gives the organization centralized control.

---

## Release Strategy

```
v0.1.0  Foundation        <- Ship now (core platform complete)
  |
v0.2.0  Production Ready  <- Deploy safely (infra, observability, ops)
  |
v0.3.0  Enterprise Gov    <- Sell to orgs (RBAC, DLP, policies, API keys)
  |
v0.4.0  Visibility        <- Deep insights (costs, health, compliance)
  |
v0.5.0  Admin Experience  <- Daily delight (UX, search, shortcuts)
  |
v1.0.0  General Avail     <- Multi-org, scaling, orchestration
```

**Versioning**: [Semantic Versioning](https://semver.org/) — staying below 1.0 until production-validated by real orgs.

---

## v0.1.0 — Foundation (complete)

The core platform. Server API, admin console, plugin, SSO, kill switch, tests, CI/CD, and docs.

| Issue | Title | Area |
|---|---|---|
| [#1](https://github.com/ClawForgeAI/clawforge/issues/1) | Enrollment tokens: admin generates token, client joins org | Server, Plugin, Auth |
| [#2](https://github.com/ClawForgeAI/clawforge/issues/2) | User CRUD API: invite, update role, remove users | Server, Admin |
| [#3](https://github.com/ClawForgeAI/clawforge/issues/3) | Organization management API and admin UI | Server, Admin |
| [#4](https://github.com/ClawForgeAI/clawforge/issues/4) | Heartbeat: smart policy refresh on version mismatch | Server, Plugin |
| [#5](https://github.com/ClawForgeAI/clawforge/issues/5) | Audit log improvements: pagination, detail view, retention | Server, Admin |
| [#9](https://github.com/ClawForgeAI/clawforge/issues/9) | Server unit and integration tests | Testing |
| [#10](https://github.com/ClawForgeAI/clawforge/issues/10) | Admin console tests (React/Next.js) | Testing |
| [#11](https://github.com/ClawForgeAI/clawforge/issues/11) | CI/CD pipeline: lint, test, build, Docker publish | Infra |
| [#12](https://github.com/ClawForgeAI/clawforge/issues/12) | Password reset flow for email/password auth | Server, Auth |
| [#13](https://github.com/ClawForgeAI/clawforge/issues/13) | Admin activity audit: log admin actions | Server, Admin |
| [#14](https://github.com/ClawForgeAI/clawforge/issues/14) | Real-time kill switch via SSE | Server, Plugin |
| [#15](https://github.com/ClawForgeAI/clawforge/issues/15) | Admin dashboard: connected clients view with live status | Server, Admin |
| [#16](https://github.com/ClawForgeAI/clawforge/issues/16) | Plugin: graceful degradation and offline mode | Plugin |
| [#17](https://github.com/ClawForgeAI/clawforge/issues/17) | Policy editor: conflict detection and effective policy preview | Admin |
| [#18](https://github.com/ClawForgeAI/clawforge/issues/18) | Skill lifecycle: revoke approval, re-review, version tracking | Server, Admin |
| [#20](https://github.com/ClawForgeAI/clawforge/issues/20) | Admin console: responsive design and UX polish | Admin |
| [#21](https://github.com/ClawForgeAI/clawforge/issues/21) | Secure audit event ingestion: require auth on POST /audit/events | Server |
| [#22](https://github.com/ClawForgeAI/clawforge/issues/22) | E2E setup guide: full onboarding walkthrough | Docs |
| [#38](https://github.com/ClawForgeAI/clawforge/issues/38) | RBAC: add viewer role beyond admin/user | Server |
| [#39](https://github.com/ClawForgeAI/clawforge/issues/39) | Audit log retention and cleanup | Server |
| [#40](https://github.com/ClawForgeAI/clawforge/issues/40) | API rate limiting on auth and audit endpoints | Server |
| [#41](https://github.com/ClawForgeAI/clawforge/issues/41) | Deep health check endpoint with dependency verification | Server |
| [#44](https://github.com/ClawForgeAI/clawforge/issues/44) | API key authentication for service accounts | Server |

---

## v0.2.0 — Production Ready

Make ClawForge deployable in real production environments with proper infrastructure, observability, and operational tooling.

| Issue | Title | Area |
|---|---|---|
| [#6](https://github.com/ClawForgeAI/clawforge/issues/6) | OpenClaw plugin SDK: define hook contract and plugin registration API | Plugin |
| [#7](https://github.com/ClawForgeAI/clawforge/issues/7) | OpenClaw: browser-open support for /clawforge-login SSO flow | Plugin, Auth |
| [#8](https://github.com/ClawForgeAI/clawforge/issues/8) | Docker and docker-compose setup for production deployment | Infra |
| [#19](https://github.com/ClawForgeAI/clawforge/issues/19) | OpenClaw: skill scanner integration for /clawforge-submit | Plugin |
| [#42](https://github.com/ClawForgeAI/clawforge/issues/42) | Audit log export (CSV/JSON) for SIEM integration | Server, Admin |
| [#45](https://github.com/ClawForgeAI/clawforge/issues/45) | Org settings management UI (SSO, audit level, heartbeat config) | Admin |
| [#46](https://github.com/ClawForgeAI/clawforge/issues/46) | Dashboard auto-refresh and polling for live metrics | Admin |
| [#47](https://github.com/ClawForgeAI/clawforge/issues/47) | Plugin version tracking in heartbeat | Server, Plugin |
| [#73](https://github.com/ClawForgeAI/clawforge/issues/73) | Health check endpoint & readiness probes | Server, Infra |
| [#74](https://github.com/ClawForgeAI/clawforge/issues/74) | Per-organization and per-user rate limiting | Server |
| [#75](https://github.com/ClawForgeAI/clawforge/issues/75) | Database migration safety: dry-run, verification & rollback | Server, Infra |
| [#76](https://github.com/ClawForgeAI/clawforge/issues/76) | Observability: structured logging & OpenTelemetry metrics export | Server, Infra |

---

## v0.3.0 — Enterprise Governance

The features that make an enterprise buyer say "yes" — granular access control, data protection, and policy management.

| Issue | Title | Area |
|---|---|---|
| [#23](https://github.com/ClawForgeAI/clawforge/issues/23) | Multiple policies: assign different policies to different clients/users | Server |
| [#43](https://github.com/ClawForgeAI/clawforge/issues/43) | Webhook notifications for key admin events | Server, Admin |
| [#53](https://github.com/ClawForgeAI/clawforge/issues/53) | Prompt injection detection in audit logs | Server, Admin |
| [#56](https://github.com/ClawForgeAI/clawforge/issues/56) | Fleet-wide version compliance enforcement | Server, Admin, Plugin |
| [#57](https://github.com/ClawForgeAI/clawforge/issues/57) | Gateway crash & restart event tracking | Server, Plugin |
| [#60](https://github.com/ClawForgeAI/clawforge/issues/60) | API key management for external integrations | Server, Admin |
| [#61](https://github.com/ClawForgeAI/clawforge/issues/61) | Role-based access control (RBAC) beyond admin/user | Server, Admin |
| [#62](https://github.com/ClawForgeAI/clawforge/issues/62) | Policy change audit trail & approval workflow | Server, Admin |
| [#64](https://github.com/ClawForgeAI/clawforge/issues/64) | Instance grouping & tagging for fleet organization | Server, Admin |
| [#66](https://github.com/ClawForgeAI/clawforge/issues/66) | Data Loss Prevention (DLP) rules for tool calls | Server, Plugin |

---

## v0.4.0 — Visibility & Intelligence

Deep fleet observability, cost management, and compliance reporting.

| Issue | Title | Area |
|---|---|---|
| [#34](https://github.com/ClawForgeAI/clawforge/issues/34) | Cost tracking & budget enforcement | Admin, Server |
| [#51](https://github.com/ClawForgeAI/clawforge/issues/51) | Anomaly detection on audit logs | Server, Admin |
| [#54](https://github.com/ClawForgeAI/clawforge/issues/54) | Model usage & fallback visibility dashboard | Server, Admin |
| [#55](https://github.com/ClawForgeAI/clawforge/issues/55) | Channel health monitoring per instance | Server, Admin, Plugin |
| [#59](https://github.com/ClawForgeAI/clawforge/issues/59) | Auth profile & credential rotation policy | Server, Admin, Auth |
| [#65](https://github.com/ClawForgeAI/clawforge/issues/65) | Compliance report generation (SOC2, ISO 27001) | Server, Admin |
| [#67](https://github.com/ClawForgeAI/clawforge/issues/67) | Session recording & replay for incident investigation | Server, Admin |
| [#69](https://github.com/ClawForgeAI/clawforge/issues/69) | Per-session cost tracking aggregation across fleet | Server, Admin |
| [#70](https://github.com/ClawForgeAI/clawforge/issues/70) | Risk-level authorization tiers for tool access | Server, Admin, Plugin |
| [#82](https://github.com/ClawForgeAI/clawforge/issues/82) | Audit log real-time streaming view (SSE/WebSocket) | Server, Admin |

---

## v0.5.0 — Admin Experience

Polish the admin console for daily power-user workflows.

| Issue | Title | Area |
|---|---|---|
| [#50](https://github.com/ClawForgeAI/clawforge/issues/50) | Slack/Teams integration for admin notifications | Server |
| [#58](https://github.com/ClawForgeAI/clawforge/issues/58) | Post-restart task continuation governance | Server, Plugin |
| [#63](https://github.com/ClawForgeAI/clawforge/issues/63) | Scheduled policy activation (time-based rules) | Server, Admin |
| [#68](https://github.com/ClawForgeAI/clawforge/issues/68) | Plugin configuration distribution via control plane | Server, Plugin |
| [#71](https://github.com/ClawForgeAI/clawforge/issues/71) | Prompt caching policy controls | Server, Plugin |
| [#72](https://github.com/ClawForgeAI/clawforge/issues/72) | Cron job governance and visibility | Server, Admin, Plugin |
| [#78](https://github.com/ClawForgeAI/clawforge/issues/78) | Global search across audit logs, users, and policies | Admin |
| [#79](https://github.com/ClawForgeAI/clawforge/issues/79) | Dark mode support for admin console | Admin |
| [#80](https://github.com/ClawForgeAI/clawforge/issues/80) | Keyboard shortcuts for admin console power users | Admin |
| [#81](https://github.com/ClawForgeAI/clawforge/issues/81) | Bulk operations on instances (multi-select actions) | Admin |

---

## v1.0.0 — General Availability

Multi-org, horizontally scalable, with advanced orchestration. Gate on real production usage by 2-3 orgs with no critical bugs.

| Issue | Title | Area |
|---|---|---|
| [#30](https://github.com/ClawForgeAI/clawforge/issues/30) | Multi-agent orchestration dashboard | Admin |
| [#31](https://github.com/ClawForgeAI/clawforge/issues/31) | Cross-client memory/context sharing | Plugin, Server |
| [#32](https://github.com/ClawForgeAI/clawforge/issues/32) | Smart routing / task delegation across fleet | Server |
| [#33](https://github.com/ClawForgeAI/clawforge/issues/33) | Per-context profiles (work mode / personal mode) | Plugin |
| [#35](https://github.com/ClawForgeAI/clawforge/issues/35) | Shared skill marketplace (private/org-scoped) | Plugin, Server |
| [#36](https://github.com/ClawForgeAI/clawforge/issues/36) | Event-driven triggers across clients | Server, Plugin |
| [#37](https://github.com/ClawForgeAI/clawforge/issues/37) | Backup & restore: one-click agent state export/import | Plugin, Server |
| [#48](https://github.com/ClawForgeAI/clawforge/issues/48) | Multi-org management UI and org creation flow | Admin |
| [#49](https://github.com/ClawForgeAI/clawforge/issues/49) | Terraform/Pulumi provider for policy-as-code | Infra |
| [#77](https://github.com/ClawForgeAI/clawforge/issues/77) | Horizontal scaling: stateless server mode | Server, Infra |
