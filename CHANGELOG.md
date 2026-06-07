# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2026-06-08

### Added — AGT Control Plane (Cut 2)

- **Agent Hypervisor** — runtime overview joining identities + audit + metrics with live / idle / offline bands; admin lifecycle controls (Pause / Resume / Terminate) where Terminate revokes the identity and opens an agent-scoped kill switch in a single transaction.
- **Identity management** — register / list / inspect DID-anchored agent identities with status mutation (active / suspended / revoked); per-DID delegation graph showing outgoing and incoming authority.
- **Discovery (shadow agents)** — fingerprint-based detection of unenrolled runtimes with triage states (unknown / investigating / known / quarantined) and admin annotation notes.
- **Trust heatmap** — per-agent trust scores with AGT tier derivation (Untrusted / Provisional / Trusted / Verified) and a continuous-HSL visualisation across trust dimensions.
- **Compliance attestation** — generate a JWT-signed proof of audit-chain integrity for an org + time range; verifier round-trips the signature and orgId match. Includes per-agent boundary hashes so auditors can reconcile attestations across adjacent ranges.
- **Metrics ingest** — agent-submitted runtime snapshots with summary aggregations (overall / 24h / 1h) and a top-agent leaderboard.
- **Kill-switch panel rewrite** — admin drives the canonical AGT routes (`kill_switch_scopes` table) with live multi-tab updates via SSE.
- **Server-Sent Events infrastructure** — org-scoped event bus broadcasting `kill_switch`, `policy_changed`, and `identity_changed` events; client `SseEventSource` dispatches both kill-switch and policy-changed flows.
- **Client SSE consumer** — `Clawforge.connect()` auto-detects SSE with polling fallback; new `cf.onPolicyChanged()` API; the client re-fetches and reloads the AGT engine when a `policy_changed` event arrives.
- **End-to-end smoke example** — `examples/cut2b-smoke.mjs` exercises every Cut 2 endpoint in order against a running stack.

### Changed

- **Audit chain hardening** — chains are now scoped per-agent; `POST /audit/:orgId/verify` walks each agent independently and reports break kind (`linkage` vs `content`).
- **Admin navigation** — Hypervisor / Identities / Discovery / Trust / Compliance / Metrics added to the sidebar; governance section reorganised.
- **UI consistency** — Policies / Approvals / Audit pages migrated to the shared Sidebar + Card shell used by every other page.
- **CI typecheck + server-test jobs** build platform packages first, eliminating intermittent workspace-package resolution failures.

### Deprecated

- `PUT /api/v1/policies/:orgId/kill-switch` — superseded by AGT `POST` / `DELETE /api/v1/kill-switch`; the plugin migrates to the AGT kill-switch source in v0.4 (Cut 3).

### Removed

- Cut 1 `GET /api/v1/kill-switch/stream` heartbeat placeholder — superseded by the shared `/api/v1/events/:orgId/stream` bus.
- Unused legacy admin API helpers (`getPolicy`, `getEffectivePolicy`, `updatePolicy`, `setKillSwitch`) and the `EffectivePolicy` type.

### Fixed

- Dashboard reads AGT tables exclusively — no more dependency on the legacy `policies.killSwitch` column.
- README.md prettier nit that had been failing CI since 2026-05-19.

## [0.2.1] - 2026-04-06

### Added

- **External alert routing** — webhook delivery for alerts, expanding escalation paths beyond the dashboard.
- Tighter bridge between in-product detection and downstream response systems.

## [0.2.0] - 2026-04-06

### Changed

- **Skill review hardening** — skill scanner wired directly into the submission path.
- Auto-block of high-risk findings before approval.
- Skill governance moved from a passive review queue to a true operator workflow.

## [0.1.0] - 2026-03-11

### Added

- **Centralized Policy Enforcement** — tool allow/deny lists and enforcement profiles to control which AI tools developers can access.
- **Skill Governance** — admin review and approval workflow for skills, ensuring only vetted capabilities are available.
- **Audit Trail** — comprehensive logging of tool calls, sessions, and LLM interactions for compliance and debugging.
- **Kill Switch** — emergency disable of all AI tool access across the organization.
- **SSO / OIDC Integration** — support for Okta, Auth0, and Entra ID alongside email/password authentication.
- **Enrollment Tokens** — invite tokens for onboarding users without SSO.
- **Heartbeat Monitoring** — instance status tracking and policy version monitoring.
- **`/clawforge-status` command** — user-facing command to check current policy and connection status.
- Plugin package `@clawforgeai/clawforge` (v0.1.5).
- Server package `@ClawForgeAI/clawforge-server`.
- Admin dashboard package `@ClawForgeAI/clawforge-admin`.

[Unreleased]: https://github.com/ClawForgeAI/clawforge/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/ClawForgeAI/clawforge/releases/tag/v0.3.0
[0.2.1]: https://github.com/ClawForgeAI/clawforge/releases/tag/v0.2.1
[0.2.0]: https://github.com/ClawForgeAI/clawforge/releases/tag/v0.2.0
[0.1.0]: https://github.com/ClawForgeAI/clawforge/releases/tag/v0.1.0
