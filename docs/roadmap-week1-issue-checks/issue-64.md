# Week 1 Issue Check — #64

- Issue: https://github.com/ClawForgeAI/clawforge/issues/64
- Title: Instance grouping & tagging for fleet organization
- Roadmap source: `docs/roadmap-v1.md` Week 1 release list
- Checked on: 2026-04-25

## Bounded write context
- `server/src/**` instance metadata/tag APIs and filtering
- `admin/src/**` tagging UX and grouped fleet views
- `server/src/db/**` tag persistence and query indexes

## Exit plan
1. Add server model for instance tags and grouping metadata.
2. Provide APIs to assign/remove/list tags on instances.
3. Add fleet query filters by tag/group.
4. Implement admin tag management and grouped rendering.
5. Add tests for tag CRUD, filtering, and UI behavior.

## Acceptance criteria
- Admins can manage tags on instances from the dashboard.
- Fleet and audit queries can be filtered by tags.
- Tests cover tag lifecycle and filter accuracy.
