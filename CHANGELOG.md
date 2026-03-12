# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/ClawForgeAI/clawforge/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/ClawForgeAI/clawforge/releases/tag/v0.1.0
