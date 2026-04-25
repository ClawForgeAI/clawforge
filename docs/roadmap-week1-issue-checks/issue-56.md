# Week 1 Issue Check — #56

- Issue: https://github.com/ClawForgeAI/clawforge/issues/56
- Title: Fleet-wide version compliance enforcement
- Roadmap source: `docs/roadmap-v1.md` Week 1 release list
- Checked on: 2026-04-25

## Bounded write context
- `server/src/**` heartbeat/version compliance services and APIs
- `admin/src/**` compliance views and dashboards
- `plugin/src/**` heartbeat payload version metadata

## Exit plan
1. Ensure heartbeat payload includes normalized plugin/agent version fields.
2. Add server-side compliance evaluator against approved version policy.
3. Persist compliance state and expose compliance summary endpoints.
4. Add admin dashboard indicators for non-compliant instances.
5. Add regression tests for evaluator and UI rendering.

## Acceptance criteria
- Compliance status is computed per active instance.
- Admin dashboard shows compliance percentage and non-compliant list.
- Tests verify compliant/non-compliant edge cases.
