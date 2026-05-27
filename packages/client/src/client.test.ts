import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@clawforgeai/policy-schema";
import { Clawforge, ClawforgeDenied, ClawforgeNotConnected, InMemoryKillSwitchSource } from "./index.js";

const SAMPLE_POLICY_YAML = `
version: "1.0"
name: test-policy
description: A policy used by client tests
rules:
  - name: block_shell
    condition:
      field: tool_name
      operator: eq
      value: shell_exec
    action: deny
    priority: 100
    message: shell access is denied in tests
  - name: allow_web_search
    condition:
      field: tool_name
      operator: eq
      value: web_search
    action: allow
    priority: 50
    message: web search is allowed
defaults:
  action: allow
  max_tokens: 4096
  max_tool_calls: 10
  confidence_threshold: 0.8
`;

interface CallRecord {
  url: string;
  method: string;
  body?: unknown;
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeMockFetch(opts: { policyYaml?: string; auditSink?: (entries: AuditEntry[]) => void }) {
  const calls: CallRecord[] = [];
  const fetchImpl = (async (input: FetchInput, init?: FetchInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url: string }).url;
    const parsed = new URL(url);
    const method = init?.method ?? "GET";
    let body: unknown;
    if (typeof init?.body === "string" && init.body.length > 0) {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    calls.push({ url: parsed.pathname + parsed.search, method, body });

    if (method === "GET" && parsed.pathname === "/api/v1/policies/effective") {
      return new Response(opts.policyYaml ?? SAMPLE_POLICY_YAML, {
        headers: { "content-type": "text/yaml" },
      });
    }
    if (method === "POST" && parsed.pathname.startsWith("/api/v1/audit/")) {
      opts.auditSink?.(body as AuditEntry[]);
      return new Response(null, { status: 204 });
    }
    if (method === "GET" && parsed.pathname.startsWith("/api/v1/kill-switch/")) {
      return new Response(JSON.stringify({ active: false, scope: "agent", reason: "", updatedAt: "" }), {
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

async function connect(opts: { policyYaml?: string; auditSink?: (e: AuditEntry[]) => void } = {}) {
  const mock = makeMockFetch(opts);
  const killSwitchSource = new InMemoryKillSwitchSource();
  const client = await Clawforge.connect({
    url: "https://test.clawforge.local",
    token: "tk-test",
    agentDid: "did:mesh:test-agent",
    fetch: mock.fetchImpl,
    killSwitchSource,
    auditBatch: { maxEntries: 2, maxMs: 50 },
  });
  return { client, calls: mock.calls, killSwitchSource };
}

describe("Clawforge.connect — option resolution", () => {
  const original = {
    url: process.env.CLAWFORGE_URL,
    token: process.env.CLAWFORGE_TOKEN,
    did: process.env.CLAWFORGE_AGENT_DID,
  };

  beforeEach(() => {
    delete process.env.CLAWFORGE_URL;
    delete process.env.CLAWFORGE_TOKEN;
    delete process.env.CLAWFORGE_AGENT_DID;
  });

  afterEach(() => {
    process.env.CLAWFORGE_URL = original.url ?? "";
    process.env.CLAWFORGE_TOKEN = original.token ?? "";
    process.env.CLAWFORGE_AGENT_DID = original.did ?? "";
    if (original.url === undefined) delete process.env.CLAWFORGE_URL;
    if (original.token === undefined) delete process.env.CLAWFORGE_TOKEN;
    if (original.did === undefined) delete process.env.CLAWFORGE_AGENT_DID;
  });

  it("throws a clear error listing every missing field", async () => {
    await expect(Clawforge.connect({})).rejects.toThrow(/url.*token.*agentDid/s);
  });

  it("zero-config — falls back to env vars", async () => {
    process.env.CLAWFORGE_URL = "https://env.clawforge.local";
    process.env.CLAWFORGE_TOKEN = "env-token";
    process.env.CLAWFORGE_AGENT_DID = "did:mesh:env-agent";
    const { fetchImpl } = makeMockFetch({});
    const c = await Clawforge.connect({
      fetch: fetchImpl,
      killSwitchSource: new InMemoryKillSwitchSource(),
    });
    expect(c.agentDid).toBe("did:mesh:env-agent");
    await c.disconnect();
  });
});

describe("Clawforge.connect — initial policy load", () => {
  it("fetches /policies/effective and loads the policy into AGT PolicyEngine", async () => {
    const { client, calls } = await connect();
    const fetched = calls.find((c) => c.method === "GET" && c.url.startsWith("/api/v1/policies/effective"));
    expect(fetched).toBeDefined();
    expect(client.agt.policyEngine.listPolicies()).toContain("test-policy");
    await client.disconnect();
  });
});

describe("cf.evaluate", () => {
  it("returns PolicyDecisionResult denying a blocked action", async () => {
    const { client } = await connect();
    const decision = await client.evaluate("shell_exec");
    expect(decision.allowed).toBe(false);
    expect(decision.action).toBe("deny");
    await client.disconnect();
  });

  it("allows a known-allowed action", async () => {
    const { client } = await connect();
    const decision = await client.evaluate("web_search");
    expect(decision.allowed).toBe(true);
    await client.disconnect();
  });
});

describe("cf.audit + AuditBatcher integration", () => {
  it("hash-chains entries via AGT AuditLogger and flushes within maxMs", async () => {
    vi.useFakeTimers();
    try {
      const auditSink = vi.fn<(entries: AuditEntry[]) => void>();
      const { client } = await connect({ auditSink });

      const first = client.audit({
        agentId: "did:mesh:test-agent",
        action: "act-1",
        decision: "allow",
      });
      const second = client.audit({
        agentId: "did:mesh:test-agent",
        action: "act-2",
        decision: "deny",
      });

      // Hash chain: second.previousHash === first.hash
      expect(second.previousHash).toBe(first.hash);
      expect(first.previousHash).toBe("0".repeat(64));

      await vi.advanceTimersByTimeAsync(60);
      await client.disconnect();

      expect(auditSink).toHaveBeenCalled();
      const delivered = auditSink.mock.calls.flatMap((c) => c[0]);
      expect(delivered).toHaveLength(2);
      expect(delivered[0].hash).toBe(first.hash);
      expect(delivered[1].hash).toBe(second.hash);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("cf.onKillSwitch", () => {
  it("invokes registered handler on simulated SSE event", async () => {
    const { client, killSwitchSource } = await connect();
    const handler = vi.fn();
    client.onKillSwitch(handler);

    await killSwitchSource.trigger({
      active: true,
      scope: "agent",
      reason: "incident response",
      receivedAt: new Date().toISOString(),
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ active: true, scope: "agent" });
    await client.disconnect();
  });

  it("unsubscribe stops further invocations", async () => {
    const { client, killSwitchSource } = await connect();
    const handler = vi.fn();
    const unsubscribe = client.onKillSwitch(handler);

    await killSwitchSource.trigger({ active: true, scope: "agent", reason: "first", receivedAt: "x" });
    unsubscribe();
    await killSwitchSource.trigger({ active: false, scope: "agent", reason: "cleared", receivedAt: "y" });

    expect(handler).toHaveBeenCalledTimes(1);
    await client.disconnect();
  });
});

describe("cf.govern", () => {
  it("returns result when policy allows", async () => {
    const { client } = await connect();
    const safe = client.govern(async (q: string) => `searched: ${q}`, "web_search");
    const out = await safe("foo");
    expect(out).toBe("searched: foo");
    await client.disconnect();
  });

  it("throws ClawforgeDenied when policy blocks", async () => {
    const { client } = await connect();
    const safe = client.govern(async () => "dangerous", "shell_exec");
    await expect(safe()).rejects.toBeInstanceOf(ClawforgeDenied);
    await client.disconnect();
  });

  it("audits both allow and deny outcomes", async () => {
    const sink: AuditEntry[] = [];
    const { client } = await connect({ auditSink: (e) => sink.push(...e) });

    const safeAllowed = client.govern(async () => "ok", "web_search");
    await safeAllowed();

    const safeDenied = client.govern(async () => "no", "shell_exec");
    await expect(safeDenied()).rejects.toBeInstanceOf(ClawforgeDenied);

    await client.disconnect();

    const actions = sink.map((e) => `${e.action}:${e.decision}`);
    expect(actions).toContain("web_search:allow");
    expect(actions).toContain("shell_exec:deny");
  });
});

describe("escape hatch — cf.agt.*", () => {
  it("policyEngine is the SAME instance that cf.evaluate delegates to (no double-load)", async () => {
    const { client } = await connect();
    // Direct call to the embedded engine should match the routed call.
    const direct = client.agt.policyEngine.evaluatePolicy("did:clawforge:local", {
      tool_name: "shell_exec",
    });
    const viaClient = await client.evaluate("shell_exec");
    expect(direct.allowed).toBe(false);
    expect(viaClient.allowed).toBe(false);
    // Policy loaded once — no duplicate engine instance.
    expect(client.agt.policyEngine.listPolicies()).toContain("test-policy");
    await client.disconnect();
  });

  it("exposes auditLogger, killSwitch, trust", async () => {
    const { client } = await connect();
    expect(client.agt.auditLogger).toBeDefined();
    expect(client.agt.killSwitch).toBeDefined();
    expect(client.agt.trust).toBeDefined();
    await client.disconnect();
  });
});

describe("cf.disconnect", () => {
  it("flushes pending audit and rejects further calls", async () => {
    const auditSink = vi.fn<(entries: AuditEntry[]) => void>();
    const { client } = await connect({ auditSink });

    client.audit({
      agentId: "did:mesh:test-agent",
      action: "before-disconnect",
      decision: "allow",
    });
    await client.disconnect();

    expect(auditSink).toHaveBeenCalled();
    expect(() => client.audit({ agentId: "did:mesh:test-agent", action: "after", decision: "allow" })).toThrow(
      ClawforgeNotConnected,
    );
  });

  it("is idempotent", async () => {
    const { client } = await connect();
    await client.disconnect();
    await client.disconnect();
  });
});
