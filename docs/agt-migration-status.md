# AGT Canonical Adoption — Migration Status

ClawForge is migrating its policy / audit / approval shapes to Microsoft's
[Agent Governance Toolkit](https://github.com/microsoft/agent-governance-toolkit)
(AGT) canonical model. See `/Users/rahular/.claude-bud/plans/` for the
original plan and addendum that drive the work.

## Cut 1 — model + data plane (delivered on `feat/agt-canonical`)

All ten implementation steps from addendum §A9 have landed additively —
AGT-shaped APIs ship alongside the legacy ones so consumers can migrate at
their own pace. Each step closed with the CI-equivalent gate green.

| #   | Package / surface                                                                                                           | Status          |
| --- | --------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `packages/policy-schema` (vendor AGT JSON Schema + Zod + YAML)                                                              | done            |
| 2   | `packages/client` (`Clawforge.connect()` SDK)                                                                               | done            |
| 3   | `packages/policy-engine` (`ClawforgeEvaluator` AGT wrapper)                                                                 | done            |
| 4   | `packages/contracts` (re-export AGT shapes, deprecate legacy)                                                               | done            |
| 5   | `packages/agent-sdk` (add `applyAgtPolicy` + `setAgtPolicy`)                                                                | done            |
| 6   | `server/db` (8 new tables + 5 policy columns, idempotent migration)                                                         | done            |
| 7   | `server/routes` (`/policies/effective`/`/evaluate`/`/agt`, `/audit/*/entries`, `/identities`, `/approvals`, `/kill-switch`) | done            |
| 8   | `plugin/src/agt` (`createAgtBackedRuntime`, `createAgtToolEnforcerHook`)                                                    | done            |
| 9   | `admin/` Tier 1 pages (`/policies/agt`, `/audit/agt`, `/approvals`)                                                         | done            |
| 10  | `agt verify` / `agt lint-policy` in CI                                                                                      | done (advisory) |

## Deprecated — scheduled for removal in a follow-on cut

The following stay in the repo because consumers (the legacy `plugin/src/
policy/tool-enforcer.ts`, `plugin/src/audit/audit-logger.ts`, the
non-AGT admin pages, and the legacy `policy-engine/src/evaluate.ts`) still
depend on them. They are JSDoc-tagged `@deprecated` and will be removed
once those consumers migrate to the AGT-aware methods:

- `packages/tool-governance` — fold into `policy-engine` (DLP rules become
  AGT policy rules; MCP scanning wraps AGT `McpSecurityScanner`)
- `packages/contracts/src/{policy,audit,approvals}.ts` — the legacy
  `OrgPolicy`, `AuditEvent`, `ApprovalRequest` types
- `policy-engine/src/{types,evaluate}.ts` — legacy `evaluateToolCall`
  / `PolicyDecision` / `PolicyEvaluationContext`
- `agent-sdk/src/base-adapter.ts` — `setPolicy(OrgPolicy)` and
  `evaluateTool(input)` (kept alongside `setAgtPolicy` / `evaluateToolWithAgt`)
- `server/src/routes/policies.ts`, `audit.ts`, `skills.ts` — legacy
  routes; new AGT routes ship in `agt-*.ts` files

## Cut 2 milestones (next)

Per addendum §A14 + §A18:

- Admin Tier 2 — `/kill-switch` SSE panel, `/identities` + delegation tree
- Admin Tier 3 — `/trust` heatmap, `/metrics`, `/discovery`, `/compliance`
- Agent Hypervisor integration (delta engine + commitment anchoring)
- DID-signed transport per AGENTMESH-WIRE-1.0
- Populate `agt-evidence.json` from `/api/v1/conformance/attestation`
- Switch `agt-conformance.yml` from `continue-on-error: true` to required
