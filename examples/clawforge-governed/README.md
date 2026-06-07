# clawforge-governed — example agent

A tiny example agent that proves policies authored in the ClawForge admin
actually enforce on the agent side. Two demos:

| Demo                           | What it needs                              | What it shows                                                                                                                                   |
| ------------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **`govern-in-60-seconds.mjs`** | Just Node 22 — no server, no Docker        | The full SDK loop against an in-memory mock server. Mirrors AGT's `examples/quickstart/govern_in_60_seconds.py`.                                |
| **`live-demo.mjs`**            | The full `docker compose up` stack + a JWT | A Clawforge-governed agent against the running server. Reads the effective AGT YAML, enforces it, streams a hash-chained audit to `/audit/agt`. |

## Quick start (no Docker)

```sh
cd /Users/rahular/Documents/Projects/clawforge-workspace/clawforge
pnpm install
node examples/clawforge-governed/govern-in-60-seconds.mjs
```

You should see something like:

```
🛡️  Clawforge Governance in 60 Seconds

Policy: name: example-strict-policy
Agent:  did:mesh:60s-demo

1. Direct evaluation

  ✅ read_file            → allow (allow_read)
  ✅ web_search           → allow (allow_search)
  🚫 shell_exec           → deny (deny_shell)
  🚫 delete_file          → deny (deny_delete)
  🚫 large_call           → deny (deny_large_token_calls)

2. govern() wrapper — auto-audit + auto-deny

  ✅ safeRead("/etc/hosts") → "contents of /etc/hosts"
  🚫 safeShell("rm -rf /")  → throws ClawforgeDenied: shell access is denied for governed agents

3. Audit chain integrity

  1 batch(es), 2 entries delivered
  ✅ chain integrity verified across 2 entries

📊 Summary
  decisions: {"allow":1,"deny":1}
```

What this proves:

- The policy YAML at `./policies/strict.yaml` parses through the AGT JSON
  Schema validator in `@clawforgeai/policy-schema`
- `Clawforge.connect()` fetches it from the (mock) server and loads it into
  the in-process AGT `PolicyEngine` via `ClawforgeEvaluator`
- `cf.evaluate(action)` runs locally (no per-call HTTP) and returns the
  rich `PolicyDecisionResult`
- `cf.govern(toolFn)` is a one-liner wrapper: evaluate → execute → audit;
  denied calls throw `ClawforgeDenied`
- Every governance decision lands as a hash-chained `AuditEntry`, batched
  and flushed to the server on disconnect

## Live demo (against the running stack)

### 1. Start the stack

```sh
docker compose up --build
```

### 2. Get a JWT

Open http://localhost:4200, log in with the seeded admin
(`admin@clawforge.local` / `clawforge`), then in the browser DevTools console:

```js
JSON.parse(localStorage.getItem("clawforge_auth")).accessToken;
```

```sh
export CLAWFORGE_URL=http://localhost:4100
export CLAWFORGE_TOKEN="<paste the JWT>"
export CLAWFORGE_AGENT_DID=did:mesh:live-demo
```

### 3. Author a policy (one-time)

Either author it in the admin at http://localhost:4200/policies/agt, OR
POST this example fixture:

```sh
curl -s -X POST \
  -H "Authorization: Bearer $CLAWFORGE_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n --rawfile yaml policies/strict.yaml \
    '{name: "example-strict-policy", yamlSource: $yaml}')" \
  $CLAWFORGE_URL/api/v1/policies/agt
```

(If you don't have `jq`, copy the YAML manually into the admin editor.)

### 4. Run the agent

```sh
node examples/clawforge-governed/live-demo.mjs
```

You should see:

```
🛡️  Clawforge live demo against http://localhost:4100
Agent: did:mesh:live-demo

Loaded policy: example-strict-policy

1. Direct evaluation
  ✅ read_file            → allow (allow_read)
  ✅ web_search           → allow (allow_search)
  🚫 shell_exec           → deny (deny_shell) — shell access is denied for governed agents
  🚫 delete_file          → deny (deny_delete) — file deletion is denied for governed agents
  🚫 large_call           → deny (deny_large_token_calls) — token budget exceeded

2. govern() wrapper — allowed call returns, denied throws
  ✅ safeRead("/etc/hosts") → "read /etc/hosts"
  🚫 safeShell(...) blocked: shell access is denied for governed agents

3. Audit batch flushed to server. Verifying chain server-side…
  ✅ chain integrity ✓  (2 entries on server)

Done. Visit http://localhost:4200/audit/agt to see the entries.
Filter by agent DID: did:mesh:live-demo
```

### 5. See the audit entries

Open http://localhost:4200/audit/agt. Filter by DID `did:mesh:live-demo`.
Click **Verify chain integrity** — green badge ✓.

## How this maps to the architecture

```
┌─ This example agent ────────────────────────────────────┐
│  Clawforge.connect({ url, token, agentDid })            │
│      │                                                  │
│      ▼                                                  │
│  AGT primitives (in-process, hot path is local CPU)     │
│  ├─ PolicyEngine  ◄── policy YAML (cached)              │
│  ├─ AuditLogger    ──► hash chain                        │
│  ├─ KillSwitch    ◄── SSE / poll                        │
│  └─ TrustManager                                        │
│                                                         │
│  cf.evaluate("shell_exec") ──┐                          │
│                              ▼                          │
│  PolicyEngine.evaluatePolicy(...) → "deny"              │
└──────────────────────────────────────────────┬──────────┘
                                               │ HTTPS
                                               ▼
┌─ ClawForge server (:4100) ──────────────────────────────┐
│  GET  /api/v1/policies/effective?agentDid=...           │
│  POST /api/v1/audit/:orgId/entries  (batched)           │
│  POST /api/v1/audit/:orgId/verify   (chain walk)        │
│  GET  /api/v1/kill-switch/:did                          │
└─────────────────────────────────────────────────────────┘
                ▲
                │ admin authors AGT YAML here
                │
┌─ Admin (:4200) ─────────────────────────────────────────┐
│  /policies/agt   /audit/agt   /approvals                │
└─────────────────────────────────────────────────────────┘
```

## Files in this example

```
clawforge-governed/
├── README.md                     this file
├── package.json                  workspace deps (@clawforgeai/client)
├── govern-in-60-seconds.mjs      mock-server smoke test
├── live-demo.mjs                 real server end-to-end
└── policies/
    └── strict.yaml               example AGT policy (block shell/delete, allow read/search)
```

## Try this next

- Edit `policies/strict.yaml` and re-run — the agent re-fetches on each `Clawforge.connect()`.
- Author a _different_ policy in the admin scoped to the same DID and re-run — observe the decision change.
- Run `live-demo.mjs` a few times, then click **Verify chain integrity** in the admin — the chain seq should keep growing.
- Tamper with one row in `audit_entries` (see the test guide) — chain verify flips to ✗.
- Switch the policy `defaults.action` from `deny` to `allow` and watch how unknown actions flip from blocked to passed-through.
