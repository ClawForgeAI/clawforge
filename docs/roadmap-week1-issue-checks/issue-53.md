# Week 1 Issue Check — #53

- Issue: https://github.com/ClawForgeAI/clawforge/issues/53
- Title: Prompt injection detection in audit logs
- Roadmap source: `docs/roadmap-v1.md` Week 1 release list
- Checked on: 2026-04-25

## Bounded write context
- `server/src/**` for detection and audit ingestion enhancements
- `admin/src/**` for surfacing detection outcomes in audit views
- `docs/**` for rollout and operator guidance

## Exit plan
1. Add deterministic prompt-injection signal extraction on audit events.
2. Persist classifier output and confidence fields in the audit model.
3. Expose filtering endpoints for flagged events.
4. Render flagged event indicators and filters in admin audit pages.
5. Add regression tests in server and admin packages.

## Acceptance criteria
- Prompt-injection indicators are attached to supported audit events.
- Admins can filter by flagged/unflagged events.
- New tests cover detection path and UI filtering behavior.
