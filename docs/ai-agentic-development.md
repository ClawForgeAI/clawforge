# AI Agentic Development Guide

This guide explains how AI agents should execute work in the `clawforge/` product repo.

Use it together with the org-level runbook in `clawforge-hq/engineering/runbooks/ai-agentic-development-playbook.md`.

## Goal

For every functionality issue, an AI agent should start from:

- A bounded **write context**
- Clear **acceptance criteria**
- A concrete **exit plan**
- Package-appropriate **tests and verification**

The goal is not "write more tests." The goal is to stop vague tasks from turning into fragile code.

## Required Task Packet

Before implementation starts, the issue or handoff should include:

If the work is being filed in GitHub, use `.github/ISSUE_TEMPLATE/ai-agentic-functional-work.yml`.

```md
## Summary

## Desired Outcome

## Write Context

- Package(s):
- Likely files or directories:
- Related routes, pages, endpoints, contracts, or schema:
- Non-goals / out of scope:

## Acceptance Criteria

- [ ] ...

## Exit Plan

- Tests to add or update:
- Commands to run:
- Manual checks:
- Docs to update:
```

If any of those sections are missing, tighten the task before editing files.

## Write Context Checklist

Every ClawForge issue should specify the narrowest relevant surface:

- `plugin/` for OpenClaw plugin logic, auth helpers, policy enforcement, SDK behavior, CLI wiring
- `server/` for routes, middleware, services, Drizzle schema, migrations, seeds, auth, rate limiting, audit retention
- `admin/` for Next.js pages, React components, client-side auth, API client behavior, page states, dashboard flows
- `docs/` when user-facing or operator-facing behavior changes enough to require documentation

The issue should also call out:

- Related API endpoints
- Session or auth behavior
- Database schema or migration impact
- Runtime configuration or env vars
- Cross-package boundaries

## Execution Rules

1. Read the implicated files before proposing structure.
2. Keep changes inside the declared write context unless the issue forces expansion.
3. If the write context expands, explain why in the handoff.
4. Prefer the smallest change that satisfies the acceptance criteria.
5. For escaped bugs, add a regression test whenever feasible.
6. Do not close the issue on code shape alone; close it on verified behavior.

## Testing Strategy

Use layered verification instead of relying on a single kind of test.

### 1. Unit And Logic Tests

Use for:

- Pure business logic
- Policy enforcement
- Auth helpers
- Validation
- Parsing
- Service behavior

Primary commands:

- `pnpm --filter @clawforgeai/clawforge test`
- `pnpm --filter @ClawForgeAI/clawforge-server test`
- `pnpm --filter @ClawForgeAI/clawforge-admin test`

### 2. Component And Page Tests

Use for:

- UI state transitions
- Loading, empty, success, and error states
- Auth redirects
- Form behavior
- Conditional rendering driven by API responses

Current tools:

- Vitest
- Testing Library
- MSW
- jsdom

### 3. Integration Checks

Use when work crosses boundaries:

- `admin/` calling `server/`
- `plugin/` sending data consumed by `server/`
- Auth/session flows touching multiple layers
- DB-backed behavior exposed in routes

At minimum, verify both sides of the boundary with targeted tests.

### 4. Browser-Level Verification

Use for high-value user journeys and regressions that unit tests miss:

- Login
- Redirect flows
- Dashboard loading and live updates
- Policy editing
- Kill switch flows
- Skill review flows

If a change affects a real user flow, browser-level verification is preferred when the suite exists.

## Package-Specific Exit Plan

### `plugin/`

Minimum expected verification:

- Update or add unit tests for the touched behavior
- Run `pnpm --filter @clawforgeai/clawforge test`

Add a changeset when the change is user-facing for the published plugin.

### `server/`

Minimum expected verification:

- Update or add route/service tests
- Run `pnpm --filter @ClawForgeAI/clawforge-server test`
- Run `pnpm --filter @ClawForgeAI/clawforge-server build`

If schema or migration logic changes, also verify the migration path explicitly.

### `admin/`

Minimum expected verification:

- Update or add component/page tests
- Run `pnpm --filter @ClawForgeAI/clawforge-admin test`
- Run `pnpm --filter @ClawForgeAI/clawforge-admin build`

If the change affects auth, navigation, data loading, or a critical workflow, add or run browser-level verification too.

### Cross-Package Work

If the issue crosses packages, the exit plan must include checks for each touched boundary.

Examples:

- `server/` route shape changed -> verify `server/` tests and `admin/` consumer behavior
- `plugin/` audit payload changed -> verify `plugin/` producer logic and `server/` ingest behavior
- Auth/session behavior changed -> verify `server/`, `admin/`, and relevant redirects

## Frontend-Specific Rules

For `admin/`, do not treat "renders without crashing" as sufficient verification.

Every meaningful UI issue should define expected behavior for:

- Initial loading state
- Success state
- Error state
- Empty state when applicable
- Redirect/auth behavior when applicable
- API contract assumptions

When a bug comes from the UI, capture the actual user journey that failed, not just the component name.

## API And Contract Rules

The admin client in `admin/src/lib/api.ts` is a contract boundary. When changing API behavior:

- Verify the server response shape
- Verify the admin consumer behavior
- Prefer shared schemas or explicit contract checks over guessed payloads

Never close an integration issue without checking both sides of the contract.

## Suggested Issue Template

```md
## Summary

Fix dashboard policy banner state when kill switch data is stale.

## Desired Outcome

Admins should see the correct kill switch state after login and after live refresh.

## Write Context

- Package(s): `admin/`, `server/`
- Likely files: `admin/src/app/dashboard/page.tsx`, `admin/src/lib/api.ts`, `server/src/routes/policies.ts`
- Related contract: `GET /api/v1/policies/:orgId`
- Out of scope: policy editor redesign, audit export changes

## Acceptance Criteria

- [ ] Dashboard shows active kill switch banner when API says active
- [ ] Dashboard clears the banner when API says inactive
- [ ] Existing dashboard stats still render correctly

## Exit Plan

- Tests to add or update: dashboard page test, server route test if contract changed
- Commands to run:
  - `pnpm --filter @ClawForgeAI/clawforge-admin test`
  - `pnpm --filter @ClawForgeAI/clawforge-admin build`
  - `pnpm --filter @ClawForgeAI/clawforge-server test`
- Manual checks: login, open dashboard, toggle live refresh, verify banner state
- Docs to update: none unless behavior changes for operators
```

## Handoff Template

Use this shape when closing the task:

```md
## What Changed

## Verification

- Command:
- Result:

## Tests Added / Updated

## Residual Risks / Follow-Ups
```

## Repo Guardrails

- Do not rely on root `pnpm test` alone for feature work
- Run package-specific checks for every touched area
- If CI does not currently protect the changed surface, say so in the handoff
- If an issue reveals a missing test layer, create a follow-up task to add it

## Definition Of Done

The task is done only when:

- Acceptance criteria are satisfied
- The write context was respected or expanded intentionally
- The exit plan was executed
- Testing evidence is included
- Remaining gaps are called out plainly
