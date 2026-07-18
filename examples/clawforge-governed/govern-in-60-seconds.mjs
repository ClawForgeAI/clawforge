/* eslint-disable no-console -- demo script is intentionally chatty */
/**
 * Govern your agent in 60 seconds — Clawforge edition.
 *
 * Self-contained smoke test. No Docker, no server, no Postgres — just
 * Node 22 and an installed workspace. Mirrors AGT's
 * `examples/quickstart/govern_in_60_seconds.py` for parity.
 *
 * What it does:
 *   1. Spins up an in-memory mock server that serves the YAML in
 *      ./policies/strict.yaml and stores any audit batches it receives.
 *   2. Connects @clawforgeai/client against that mock.
 *   3. Runs five tool actions, prints the decision for each.
 *   4. Wraps a tool with `cf.govern()` and shows that the denied call
 *      throws `ClawforgeDenied` while the allowed call returns the result.
 *   5. Verifies the audit hash chain locally.
 *
 * Run it:
 *     pnpm install
 *     node examples/clawforge-governed/govern-in-60-seconds.mjs
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Clawforge, ClawforgeDenied, InMemoryKillSwitchSource } from "@clawforgeai/client";

const HERE = dirname(fileURLToPath(import.meta.url));
const POLICY_YAML = readFileSync(join(HERE, "policies", "strict.yaml"), "utf8");
const AGENT_DID = "did:mesh:60s-demo";

const auditBatches = [];

function makeMockServer() {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.href);
    const method = init?.method ?? "GET";
    const path = url.pathname;

    if (method === "GET" && path === "/api/v1/policies/effective") {
      return new Response(POLICY_YAML, { headers: { "content-type": "text/yaml" } });
    }
    if (method === "POST" && path.startsWith("/api/v1/audit/")) {
      const body = JSON.parse(init.body);
      auditBatches.push(body);
      return new Response(null, { status: 204 });
    }
    if (method === "GET" && path.startsWith("/api/v1/kill-switch/")) {
      return new Response(JSON.stringify({ active: false, scope: "agent", reason: "", updatedAt: "" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not found", { status: 404 });
  };
}

function log(label, decision) {
  const icon = decision.allowed ? "✅" : "🚫";
  const reason = decision.matchedRule ? ` (${decision.matchedRule})` : "";
  console.log(`  ${icon} ${label.padEnd(20)} → ${decision.action}${reason}`);
}

console.log("\n🛡️  Clawforge Governance in 60 Seconds\n");
console.log(`Policy: ${POLICY_YAML.split("\n")[1].trim()}`);
console.log(`Agent:  ${AGENT_DID}\n`);

const cf = await Clawforge.connect({
  url: "http://mock.local",
  token: "mock-token",
  agentDid: AGENT_DID,
  fetch: makeMockServer(),
  killSwitchSource: new InMemoryKillSwitchSource(),
  auditBatch: { maxEntries: 100, maxMs: 50 },
});

console.log("1. Direct evaluation\n");
log("read_file", await cf.evaluate("read_file"));
log("web_search", await cf.evaluate("web_search"));
log("shell_exec", await cf.evaluate("shell_exec"));
log("delete_file", await cf.evaluate("delete_file"));
log("large_call", await cf.evaluate("any", { token_count: 9999 }));

console.log("\n2. govern() wrapper — auto-audit + auto-deny\n");

const safeRead = cf.govern(async (path) => `contents of ${path}`, "read_file");
const safeShell = cf.govern(async (cmd) => `executed ${cmd}`, "shell_exec");

console.log(`  ✅ safeRead("/etc/hosts") → "${await safeRead("/etc/hosts")}"`);
try {
  await safeShell("rm -rf /");
} catch (err) {
  if (err instanceof ClawforgeDenied) {
    console.log(`  🚫 safeShell("rm -rf /")  → throws ClawforgeDenied: ${err.decision.reason}`);
  } else {
    throw err;
  }
}

await cf.disconnect();

console.log("\n3. Audit chain integrity\n");

const allEntries = auditBatches.flat();
console.log(`  ${auditBatches.length} batch(es), ${allEntries.length} entries delivered`);

const genesis = "0".repeat(64);
let chainOk = true;
let expectedPrev = genesis;
for (let i = 0; i < allEntries.length; i++) {
  const e = allEntries[i];
  if (e.previousHash !== expectedPrev) {
    chainOk = false;
    console.log(`  🚫 break at index ${i}: expected ${expectedPrev.slice(0, 12)} got ${e.previousHash.slice(0, 12)}`);
    break;
  }
  expectedPrev = e.hash;
}
console.log(chainOk ? `  ✅ chain integrity verified across ${allEntries.length} entries` : "  🚫 chain broken");

console.log("\n📊 Summary");
const stats = allEntries.reduce((acc, e) => ({ ...acc, [e.decision]: (acc[e.decision] ?? 0) + 1 }), {});
console.log(`  decisions: ${JSON.stringify(stats)}`);
console.log("");
console.log("Done. Try editing policies/strict.yaml and re-running — the agent");
console.log("automatically picks up the new policy via cf.agt.policyEngine.");
console.log("");
