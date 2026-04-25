# Week 1 Issue Check — #57

- Issue: https://github.com/ClawForgeAI/clawforge/issues/57
- Title: Gateway crash & restart event tracking
- Roadmap source: `docs/roadmap-v1.md` Week 1 release list
- Checked on: 2026-04-25

## Bounded write context
- `server/src/**` heartbeat anomaly detection and audit recording
- `plugin/src/**` restart/session lifecycle signaling
- `docs/**` operator runbook notes

## Exit plan
1. Define crash/restart detection rules using heartbeat gaps and startup markers.
2. Emit normalized `agent_crash` and `agent_restart` audit events.
3. Store event metadata for correlation (instance ID, timestamps, reason).
4. Add API support for querying crash/restart history.
5. Add regression tests for detection thresholds and event emission.

## Acceptance criteria
- Crash and restart transitions are captured as audit events.
- Event history can be queried by instance.
- Regression tests cover false-positive suppression and restart recovery.
