# Issue Tracker Realignment Plan

Status: **Proposal — pending approval before execution**

## Why this plan exists

The GitHub issue tracker has drifted from `docs/roadmap-v1.md`. Symptoms:

- v1.0.0 milestone contains 6 orchestration features that the roadmap demoted to v1.x
- 5 of 6 v0.3.0 issues belong in v1.0.0 per the roadmap's "Promoted into v1.0.0" table
- 27 open issues sit in **no-milestone** even though the roadmap places most in v1.0.0
- Three near-certain duplicates (#165, #166, #167) clutter the Phase-1 work
- The `v1.x — Orchestration & Beyond` milestone the roadmap references doesn't exist
- Stale labels from April release planning (`week-1` … `week-4`) reference dates now in the past

This document records the proposed bulk re-organization so it can be reviewed, approved, and executed as a single auditable batch.

---

## Current state

| Milestone                          |   Open | Closed | Status                                |
| ---------------------------------- | -----: | -----: | ------------------------------------- |
| v0.1.0 — Foundation                |      0 |     25 | shipped                               |
| v0.2.0 — Production Ready          |      0 |     11 | shipped                               |
| v0.3.0 — Enterprise Governance     |      6 |      4 | drift — 5 of 6 should move to v1.0.0  |
| v0.4.0 — Visibility & Intelligence |      9 |      1 | drift — 2 of 9 should move to v1.0.0  |
| v0.5.0 — Admin Experience          |     10 |      0 | aligned                               |
| v1.0.0 — General Availability      |     10 |      0 | drift — 6 of 10 should demote to v1.x |
| v1.x — Orchestration & Beyond      |      — |      — | **does not exist yet**                |
| **no-milestone**                   | **27** |      — | most should be v1.0.0                 |

Total open: **62 issues**.

---

## Proposed actions

### A. Close as duplicates (3 issues)

Verified by title comparison. The roadmap's duplicate table at line 144-147 incorrectly maps `#165 → #160`; titles show `#165` is actually the plugin-refactor duplicate, not the policy-engine extraction.

| Close | Duplicate of | Rationale                                                                                 |
| ----: | -----------: | ----------------------------------------------------------------------------------------- |
|  #166 |         #164 | Identical title: "Introduce agent-sdk package with an initial runtime lifecycle contract" |
|  #167 |         #165 | Identical title: "Refactor the OpenClaw plugin onto shared platform packages…"            |
|  #165 |         #147 | Same scope: "Refactor OpenClaw plugin to import from `@clawforgeai/core`"                 |

### B. Create `v1.x — Orchestration & Beyond` milestone

Required so the demoted items have a target. Description: _"Post-v1.0.0 features focused on orchestration (cross-client memory, smart routing, marketplace, event triggers, per-context profiles)."_

### C. Demote from v1.0.0 → v1.x (6 issues)

Per roadmap "Demoted to v1.x" table. Reason: orchestration is not governance, and v1.0.0's gate is the 8 must-have governance capabilities.

- #30 Multi-agent orchestration dashboard
- #31 Cross-client memory / context sharing
- #32 Smart routing / task delegation across fleet
- #33 Per-context profiles (work / personal mode)
- #35 Shared skill marketplace
- #36 Event-driven triggers across clients

### D. Promote to v1.0.0 (7 issues)

Per roadmap "Promoted into v1.0.0" table.

| Issue | From   | Title                                         | Capability         |
| ----: | ------ | --------------------------------------------- | ------------------ |
|   #55 | v0.4.0 | Channel health monitoring per instance        | Session Visibility |
|   #56 | v0.3.0 | Fleet-wide version compliance enforcement     | Session Visibility |
|   #57 | v0.3.0 | Gateway crash & restart event tracking        | Session Visibility |
|   #60 | v0.3.0 | API key management for external integrations  | Identity           |
|   #62 | v0.3.0 | Policy change audit trail & approval workflow | Approval Workflows |
|   #64 | v0.3.0 | Instance grouping & tagging                   | Session Visibility |
|   #82 | v0.4.0 | Audit log real-time streaming                 | Audit Trail        |

### E. Assign no-milestone vision issues (13 issues)

Per roadmap "Unlabeled issues assigned" table:

- #85 Channel governance → **v1.0.0**
- #86 Model & provider governance → **v1.0.0**
- #87 Group & DM chat access policies → **v1.x**
- #88 Exec approval policy → **v1.0.0**
- #89 Session visibility controls → **v1.0.0**
- #90 Subagent tool restrictions → **v1.0.0**
- #91 Centralized skill governance → **v1.0.0**
- #92 Plugin & extension governance → **v1.0.0**
- #93 Gateway HTTP tool policy → **v1.0.0**
- #152 EU AI Act compliance template → **v1.0.0**
- #153 NIST AI RMF / ISO 42001 templates → **v1.0.0**
- #154 Regulatory mapping documentation → **v1.0.0**
- #155 Agent registry with metadata cards → **v1.0.0**

### F. Assign Track 0 + Track 1 phase-1 issues to v1.0.0 (10 issues, after dedup)

Platform-foundation prerequisites — all roll up to v1.0.0.

- Track 0: #146, #147, #158, #159, #160, #161, #162, #163, #164
- Track 1: #148, #149, #150, #151

(After closing #165, #166, #167 in step A.)

---

## Pending decisions

These need confirmation before execution.

### Decision 1 — `#53` (last issue in v0.3.0)

The roadmap's Week 1 release lists #53 (Prompt injection detection) but the "Promoted to v1.0.0" table doesn't promote it. After step D, only #53 would remain in v0.3.0.

| Option                | Action                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------- |
| **(a)** _recommended_ | Promote #53 to v1.0.0 (governance-critical, fits Track 4 audit work) and close v0.3.0 milestone as superseded |
| (b)                   | Keep #53 alone in v0.3.0; ship a tiny v0.3.0 patch release                                                    |
| (c)                   | Demote to v1.x; close v0.3.0                                                                                  |

### Decision 2 — `#156` and `#157` (phase-5 intelligence layer)

Not referenced in roadmap-v1.md. #157 partially overlaps with #65 (Compliance report generation).

| Option                | Action                                                                       |
| --------------------- | ---------------------------------------------------------------------------- |
| **(a)** _recommended_ | Demote both to v1.x — intelligence layer is post-v1.0.0 per release strategy |
| (b)                   | Keep #156 in v1.0.0 (could fit Track 4); merge #157 into #65                 |

### Decision 3 — Close v0.3.0 milestone?

If Decision 1(a) is chosen, v0.3.0 has 4 closed + 0 open and can be closed.

### Decision 4 — Stale label cleanup (optional)

| Label                                     | Recommendation                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `week-1` / `week-2` / `week-3` / `week-4` | Leave (closed-issue history) or rename to `track-0` … `track-5` to match roadmap |
| `v1` (legacy, on shipped issues)          | Leave alone — cosmetic                                                           |
| `v2` (inconsistent naming)                | **Rename to `v1.x`** — low cost, semantic improvement                            |
| `phase-1` / `phase-3` / `phase-5`         | Once milestones are correct, these become redundant — leave for now              |

### Decision 5 — Create the 28 new issues from the roadmap?

Roadmap line 459 declares "28 new issues to create" across Tracks 1-5 (agent instance identity, teams model, approval engine, etc.). Recommendation: **defer** to a separate session so each gets proper acceptance criteria; this cleanup focuses on existing issues only.

---

## Final state preview (if all proposals approved)

| Milestone                               | Open issues | Notes                                          |
| --------------------------------------- | ----------: | ---------------------------------------------- |
| v0.1.0 — Foundation                     |           0 | shipped                                        |
| v0.2.0 — Production Ready               |           0 | shipped                                        |
| v0.3.0 — Enterprise Governance          |           0 | closed (Decision 1a)                           |
| v0.4.0 — Visibility & Intelligence      |           7 | #34, #54, #59, #65, #67, #69, #70              |
| v0.5.0 — Admin Experience               |          10 | unchanged                                      |
| **v1.0.0 — General Availability**       |     **~37** | Track 0/1 platform + 8 governance capabilities |
| **v1.x — Orchestration & Beyond** (new) |      **~9** | demoted features                               |

---

## Execution notes

When approval lands:

1. Run mutations as a single batched script with a dry-run preview first
2. Each mutation posts a comment on the affected issue: _"Moved to <milestone> per [roadmap-v1.md restructuring](link). See 'Promoted into v1.0.0' table."_
3. Closures of duplicates link to the canonical issue
4. After bulk move, verify milestone counts match the table above
5. Update this document's status from "Proposal" to "Executed YYYY-MM-DD" with a link to the script run

## References

- [`docs/roadmap-v1.md`](./roadmap-v1.md) — authoritative roadmap; section "Milestone Restructuring" is the source of truth for promotions/demotions
- ClawForge vision document (in `clawforge-hq/`) — defines the 8 must-have v1.0.0 capabilities
