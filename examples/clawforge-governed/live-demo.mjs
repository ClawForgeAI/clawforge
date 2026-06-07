/* eslint-disable no-console -- demo script is intentionally chatty */
/**
 * Live demo: a Clawforge-governed agent against the running stack.
 *
 * Prerequisites:
 *   1. `docker compose up --build` from the repo root.
 *   2. Author a policy at http://localhost:4200/policies/agt (or POST
 *      `./policies/strict.yaml` via curl — see steps below).
 *   3. Export $CLAWFORGE_URL, $CLAWFORGE_TOKEN, $CLAWFORGE_AGENT_DID.
 *
 * What it does:
 *   - Connects to the live server, fetches the effective AGT YAML.
 *   - Runs 5 tool actions and prints each decision with the matched rule.
 *   - Wraps two tools with `cf.govern()` and shows allow / deny flow.
 *   - Disconnects, flushing the batched audit entries to
 *     `POST /api/v1/audit/:orgId/entries` so they appear in
 *     http://localhost:4200/audit/agt.
 *   - Calls the chain-integrity verify endpoint and prints the result.
 *
 * Run it:
 *     export CLAWFORGE_URL=http://localhost:4100
 *     export CLAWFORGE_TOKEN="<your admin JWT — see README>"
 *     export CLAWFORGE_AGENT_DID=did:mesh:live-demo
 *     node examples/clawforge-governed/live-demo.mjs
 *
 * Bootstrap a policy if you haven't authored one yet:
 *     curl -s -X POST \
 *       -H "Authorization: Bearer $CLAWFORGE_TOKEN" \
 *       -H "Content-Type: application/json" \
 *       --data @<(node -e "const fs = require('fs'); \
 *         console.log(JSON.stringify({ name: 'example-strict-policy', \
 *         yamlSource: fs.readFileSync('examples/clawforge-governed/policies/strict.yaml', 'utf8') }))") \
 *       $CLAWFORGE_URL/api/v1/policies/agt
 */

import { Clawforge, ClawforgeDenied } from "@clawforgeai/client";

const URL = process.env.CLAWFORGE_URL;
const TOKEN = process.env.CLAWFORGE_TOKEN;
const AGENT_DID = process.env.CLAWFORGE_AGENT_DID ?? "did:mesh:live-demo";

if (!URL || !TOKEN) {
  console.error("Missing CLAWFORGE_URL or CLAWFORGE_TOKEN. See header comment.");
  process.exit(1);
}

function log(label, decision) {
  const icon = decision.allowed ? "✅" : "🚫";
  const rule = decision.matchedRule ? ` (${decision.matchedRule})` : "";
  const reason = decision.reason ? ` — ${decision.reason}` : "";
  console.log(`  ${icon} ${label.padEnd(20)} → ${decision.action}${rule}${reason}`);
}

console.log("\n🛡️  Clawforge live demo against", URL);
console.log("Agent:", AGENT_DID, "\n");

const cf = await Clawforge.connect({
  url: URL,
  token: TOKEN,
  agentDid: AGENT_DID,
  auditBatch: { maxEntries: 10, maxMs: 500 },
});

const policies = cf.agt.policyEngine.listPolicies();
if (policies.length === 0) {
  console.log("⚠️  No effective policy found for this agentDid.");
  console.log("    Author one at /policies/agt or POST ./policies/strict.yaml first.");
  await cf.disconnect();
  process.exit(0);
}
console.log(`Loaded policy: ${policies.join(", ")}\n`);

console.log("1. Direct evaluation\n");
log("read_file", await cf.evaluate("read_file"));
log("web_search", await cf.evaluate("web_search"));
log("shell_exec", await cf.evaluate("shell_exec"));
log("delete_file", await cf.evaluate("delete_file"));
log("large_call", await cf.evaluate("any", { token_count: 9999 }));

console.log("\n2. govern() wrapper — allowed call returns, denied throws\n");

const safeRead = cf.govern(async (p) => `read ${p}`, "read_file");
const safeShell = cf.govern(async (c) => `ran ${c}`, "shell_exec");

console.log(`  ✅ safeRead("/etc/hosts") → "${await safeRead("/etc/hosts")}"`);
try {
  await safeShell("rm -rf /");
} catch (err) {
  if (err instanceof ClawforgeDenied) {
    console.log(`  🚫 safeShell(...) blocked: ${err.decision.reason ?? err.decision.matchedRule}`);
  } else {
    throw err;
  }
}

await cf.disconnect();
console.log("\n3. Audit batch flushed to server. Verifying chain server-side…\n");

// Pull org id out of the JWT (no validation — purely for the URL).
const payload = JSON.parse(Buffer.from(TOKEN.split(".")[1], "base64").toString());
const orgId = payload.orgId;

const verify = await fetch(`${URL}/api/v1/audit/${orgId}/verify`, {
  method: "POST",
  headers: { Authorization: `Bearer ${TOKEN}` },
}).then((r) => r.json());

if (verify.valid) {
  console.log(`  ✅ chain integrity ✓  (${verify.entriesChecked} entries on server)`);
} else {
  console.log(`  🚫 chain break at seq ${verify.breakAt}`);
  console.log(`      expected ${verify.expected}`);
  console.log(`      actual   ${verify.actual}`);
}

console.log("\nDone. Visit http://localhost:4200/audit/agt to see the entries.");
console.log("Filter by agent DID:", AGENT_DID);
console.log("");
