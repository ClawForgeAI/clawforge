# Roadmap

## Why We Built This

When an organization adopts OpenClaw as its AI assistant:

- Each employee runs their own OpenClaw instance locally on their machine.
- Each instance can call tools (file read/write, shell exec, web fetch, etc.), install skills (third-party plugins), and interact with LLMs.
- Without governance, the org has **zero visibility or control** over what these AI assistants are doing — what tools they call, what data they access, what third-party code they run.
- There is no way to enforce security policies, audit activity, or respond to incidents across the fleet.

ClawForge solves this by providing a single admin panel that connects to every employee's OpenClaw instance and gives the organization centralized control.

---

## v1 — Open Items

These are the issues targeted for the v1 release:

| Issue | Title | Area |
|---|---|---|
| [#6](https://github.com/ClawForgeAI/clawforge/issues/6) | OpenClaw plugin SDK: define hook contract and plugin registration API | Plugin |
| [#7](https://github.com/ClawForgeAI/clawforge/issues/7) | OpenClaw: browser-open support for /clawforge-login SSO flow | Plugin, Auth |
| [#8](https://github.com/ClawForgeAI/clawforge/issues/8) | Docker and docker-compose setup for production deployment | Infra |
| [#9](https://github.com/ClawForgeAI/clawforge/issues/9) | Server unit and integration tests | Testing |
| [#10](https://github.com/ClawForgeAI/clawforge/issues/10) | Admin console tests (React/Next.js) | Testing |
| [#11](https://github.com/ClawForgeAI/clawforge/issues/11) | CI/CD pipeline: lint, test, build, Docker publish | Infra |
| [#14](https://github.com/ClawForgeAI/clawforge/issues/14) | Real-time kill switch via SSE (server-sent events) | Server, Plugin |
| [#16](https://github.com/ClawForgeAI/clawforge/issues/16) | Plugin: graceful degradation and offline mode improvements | Plugin |
| [#19](https://github.com/ClawForgeAI/clawforge/issues/19) | OpenClaw: skill scanner integration for /clawforge-submit | Plugin |
| [#22](https://github.com/ClawForgeAI/clawforge/issues/22) | E2E setup guide: full onboarding walkthrough from zero to managed fleet | Docs |

---

## Future / v2

| Item | Description |
|---|---|
| [#23 — Multiple policies](https://github.com/ClawForgeAI/clawforge/issues/23) | Assign different policies to different clients/users instead of one policy per org |
| User role management API | Invite, remove, and change roles via API (currently only via seed, enrollment tokens, or SSO) |
| Audit export | CSV/JSON export and retention policy management |
| Secret/key management | Vault integration for API keys and credentials |
| Multi-org management UI | Schema supports multiple orgs, but no org creation flow in the admin console yet |
