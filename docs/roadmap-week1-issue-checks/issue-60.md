# Week 1 Issue Check — #60

- Issue: https://github.com/ClawForgeAI/clawforge/issues/60
- Title: API key management for external integrations
- Roadmap source: `docs/roadmap-v1.md` Week 1 release list
- Checked on: 2026-04-25

## Bounded write context

- `server/src/**` service-account and API key lifecycle endpoints
- `admin/src/**` API key management UI
- `server/src/db/**` schema/migrations for key metadata

## Exit plan

1. Add API key create/list/revoke/rotate endpoints with scoped permissions.
2. Store only hashed key material and metadata (owner, scopes, expiry, last used).
3. Add authentication middleware for service-account API keys.
4. Build admin workflows to create/revoke/rotate keys.
5. Add tests for key lifecycle, scope enforcement, and UI interactions.

## Acceptance criteria

- Admins can create, view metadata, revoke, and rotate keys.
- Raw key value is returned only at creation/rotation time.
- Tests cover auth success/failure and scoped endpoint access.
