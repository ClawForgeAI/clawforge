#!/usr/bin/env node
/**
 * Cut 2b smoke-test — exercise every new AGT surface against a running stack.
 *
 *   1. Log in as admin@clawforge.local
 *   2. Register two identities (alpha + beta)
 *   3. POST a trust score for alpha
 *   4. POST a metric snapshot for alpha
 *   5. POST a shadow-agent sighting
 *   6. POST an audit batch for alpha so the chain has rows
 *   7. Activate the org-wide kill switch via AGT, then clear it
 *   8. Generate + verify an attestation
 *   9. GET the hypervisor overview
 *
 * Stops at the first non-2xx and prints the response. Run with the stack
 * already up (docker compose up -d server postgres admin).
 *
 *   node cut2b-smoke.mjs
 */

import { createHash, randomUUID } from "node:crypto";

const BASE = process.env.CLAWFORGE_URL ?? "http://localhost:4100";
const ADMIN_EMAIL = "admin@clawforge.local";
const ADMIN_PASS = "clawforge";

const fmt = (v) => (typeof v === "string" ? v : JSON.stringify(v, null, 2));
const section = (label) => console.log(`\n── ${label} ──`);

async function http(path, opts = {}) {
  const url = `${BASE}${path}`;
  const headers = { ...(opts.headers ?? {}) };
  const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
  if (body !== undefined) headers["content-type"] = "application/json";
  const res = await fetch(url, { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  if (!res.ok) {
    console.error(`✗ ${opts.method ?? (body ? "POST" : "GET")} ${path} → ${res.status}`);
    console.error(fmt(json));
    process.exit(1);
  }
  console.log(`✓ ${opts.method ?? (body ? "POST" : "GET")} ${path} → ${res.status}`);
  return json;
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

// --- 1. Login --------------------------------------------------------------
section("1. Login");
const login = await http("/api/v1/auth/login", {
  body: { email: ADMIN_EMAIL, password: ADMIN_PASS },
});
const token = login.accessToken;
const orgId = login.orgId;
const userId = login.userId;
console.log(`  orgId=${orgId} userId=${userId}`);
const authHeader = { authorization: `Bearer ${token}` };

// --- 2. Register identities ------------------------------------------------
section("2. Register identities");
const alphaDid = `did:mesh:alpha-${randomUUID().slice(0, 8)}`;
const betaDid = `did:mesh:beta-${randomUUID().slice(0, 8)}`;

await http("/api/v1/identities", {
  headers: authHeader,
  body: {
    did: alphaDid,
    publicKey: "smoke-key-alpha",
    capabilities: ["mcp:tool", "mcp:audit"],
    name: "Smoke Alpha",
    description: "Cut 2b smoke-test identity",
  },
});
await http("/api/v1/identities", {
  headers: authHeader,
  body: {
    did: betaDid,
    publicKey: "smoke-key-beta",
    capabilities: ["mcp:tool"],
    name: "Smoke Beta",
  },
});

const idList = await http("/api/v1/identities", { headers: authHeader });
console.log(`  identities now in org: ${idList.identities.length}`);

// --- 3. Trust score --------------------------------------------------------
section("3. Trust score");
const trust = await http("/api/v1/trust-scores", {
  headers: authHeader,
  body: {
    did: alphaDid,
    overall: 82,
    dimensions: { latency: 88, accuracy: 79, audit_clean: 92 },
  },
});
console.log(`  tier=${trust.tier} overall=${trust.overall}`);

const trustList = await http("/api/v1/trust-scores", { headers: authHeader });
console.log(`  dimensionKeys=${JSON.stringify(trustList.dimensionKeys)}`);

// --- 4. Metric snapshot ----------------------------------------------------
section("4. Metric snapshot");
await http("/api/v1/metrics", {
  headers: authHeader,
  body: {
    agentDid: alphaDid,
    snapshot: { tool_calls: 42, latency_p50_ms: 130, deny_rate_pct: 4 },
  },
});
const metricsSummary = await http("/api/v1/metrics/summary", { headers: authHeader });
console.log(`  total=${metricsSummary.total} last24h=${metricsSummary.last24h.total}`);

// --- 5. Shadow-agent sighting ----------------------------------------------
section("5. Shadow-agent sighting");
const fingerprint = `fp-smoke-${randomUUID().slice(0, 8)}`;
await http("/api/v1/shadow-agents", {
  headers: authHeader,
  body: {
    fingerprint,
    capabilities: ["mcp:tool"],
    runtime: "smoke-test-runtime",
  },
});
const shadows = await http("/api/v1/shadow-agents", { headers: authHeader });
console.log(`  shadow agents in org: ${shadows.shadowAgents.length}`);

// --- 6. AGT audit chain ----------------------------------------------------
section("6. AGT audit chain");
const GENESIS = "0".repeat(64);
function buildEntry({ previousHash, action, decision }) {
  const timestamp = new Date().toISOString();
  const hash = sha256(
    JSON.stringify({ timestamp, agentId: alphaDid, action, decision, previousHash }),
  );
  return { timestamp, agentId: alphaDid, action, decision, hash, previousHash };
}
const e1 = buildEntry({ previousHash: GENESIS, action: "search", decision: "allow" });
const e2 = buildEntry({ previousHash: e1.hash, action: "exec_cmd", decision: "deny" });
await http(`/api/v1/audit/${orgId}/entries`, { headers: authHeader, body: [e1, e2] });
const verify = await http(`/api/v1/audit/${orgId}/verify`, { headers: authHeader, body: {} });
console.log(`  chain valid=${verify.valid} entriesChecked=${verify.entriesChecked}`);

// --- 7. Kill-switch toggle -------------------------------------------------
section("7. Kill-switch toggle");
const ks = await http("/api/v1/kill-switch", {
  headers: authHeader,
  body: { message: "smoke-test halt" },
});
console.log(`  activated scopeId=${ks.id} kind=${ks.scope.kind}`);
const ksList = await http("/api/v1/kill-switch", { headers: authHeader });
console.log(`  active scopes: ${ksList.scopes.length}`);
await http(`/api/v1/kill-switch/${ks.id}`, { headers: authHeader, method: "DELETE" });
const ksListAfter = await http("/api/v1/kill-switch", { headers: authHeader });
console.log(`  active scopes after clear: ${ksListAfter.scopes.length}`);

// --- 8. Compliance attestation --------------------------------------------
section("8. Compliance attestation");
const fromIso = new Date(Date.now() - 60 * 60_000).toISOString();
const toIso = new Date(Date.now() + 60_000).toISOString();
const att = await http("/api/v1/attestations", {
  headers: authHeader,
  body: { fromIso, toIso },
});
console.log(
  `  valid=${att.attestation.valid} entries=${att.attestation.entriesCovered} agents=${att.attestation.agentsCovered}`,
);
console.log(`  rootHash=${att.attestation.rootHash.slice(0, 16)}…`);
const ver = await http("/api/v1/attestations/verify", {
  headers: authHeader,
  body: { token: att.token },
});
console.log(`  signatureValid=${ver.signatureValid} orgMatch=${ver.orgMatch}`);

// --- 9. Hypervisor overview ------------------------------------------------
section("9. Hypervisor overview");
const hyp = await http("/api/v1/hypervisor/agents", { headers: authHeader });
console.log(`  total=${hyp.summary.total} live=${hyp.summary.live} idle=${hyp.summary.idle} offline=${hyp.summary.offline}`);
const alphaRow = hyp.agents.find((a) => a.did === alphaDid);
console.log(`  alpha runtime=${alphaRow?.runtime} lastSeen=${alphaRow?.lastSeenAt}`);

// --- 10. Hypervisor lifecycle ----------------------------------------------
section("10. Hypervisor lifecycle (pause → resume → terminate beta)");
await http(`/api/v1/hypervisor/agents/${encodeURIComponent(betaDid)}/pause`, {
  headers: authHeader,
  body: {},
});
await http(`/api/v1/hypervisor/agents/${encodeURIComponent(betaDid)}/resume`, {
  headers: authHeader,
  body: {},
});
const term = await http(`/api/v1/hypervisor/agents/${encodeURIComponent(betaDid)}/terminate`, {
  headers: authHeader,
  body: {},
});
console.log(`  terminated status=${term.identity.status} ks=${term.killSwitchScope.id}`);

console.log("\nAll 10 sections passed ✅");
