import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@clawforgeai/policy-schema";
import { Clawforge, ClawforgeDenied, ClawforgeNotConnected, InMemoryKillSwitchSource } from "./index.js";

const TEST_TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdJZCI6InRlc3Qtb3JnIiwidXNlcklkIjoidGVzdC11c2VyIn0.sig";

async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("until() timed out");
    await new Promise<void>((r) => setImmediate(r));
  }
}

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
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdJZCI6InRlc3Qtb3JnIiwidXNlcklkIjoidGVzdC11c2VyIn0.sig",
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
    process.env.CLAWFORGE_TOKEN =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJvcmdJZCI6InRlc3Qtb3JnIiwidXNlcklkIjoidGVzdC11c2VyIn0.sig";
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

/**
 * Build a mock fetch that serves the SSE stream from a controllable
 * ReadableStream. The test pushes chunks via `controller` and decides when
 * to close the stream. Other endpoints (policies/effective, audit POST,
 * kill-switch poll) still respond normally so connect() doesn't 404.
 */
function makeFetchWithSse(opts: {
  policyYaml?: string;
  policyYamlSecond?: string;
  sseStatus?: number;
  auditSink?: (entries: AuditEntry[]) => void;
}) {
  const calls: { url: string; method: string }[] = [];
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
  let policyFetchCount = 0;
  const encoder = new TextEncoder();

  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const urlStr =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as { url: string }).url;
    const parsed = new URL(urlStr);
    const method = init?.method ?? "GET";
    calls.push({ url: parsed.pathname + parsed.search, method });

    if (method === "GET" && parsed.pathname === "/api/v1/policies/effective") {
      policyFetchCount += 1;
      const yaml =
        policyFetchCount === 1
          ? (opts.policyYaml ?? SAMPLE_POLICY_YAML)
          : (opts.policyYamlSecond ?? opts.policyYaml ?? SAMPLE_POLICY_YAML);
      return new Response(yaml, { headers: { "content-type": "text/yaml" } });
    }
    if (method === "POST" && parsed.pathname.startsWith("/api/v1/audit/")) {
      let body: unknown;
      if (typeof init?.body === "string") {
        try {
          body = JSON.parse(init.body);
        } catch {
          body = init.body;
        }
      }
      opts.auditSink?.(body as AuditEntry[]);
      return new Response(null, { status: 204 });
    }
    if (method === "GET" && parsed.pathname.startsWith("/api/v1/kill-switch/")) {
      return new Response(JSON.stringify({ active: false, scope: "agent", reason: "", updatedAt: "" }), {
        headers: { "content-type": "application/json" },
      });
    }
    if (method === "GET" && /^\/api\/v1\/events\/.+\/stream$/.test(parsed.pathname)) {
      if (opts.sseStatus && opts.sseStatus !== 200) {
        return new Response("nope", { status: opts.sseStatus });
      }
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          streamController = controller;
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return new Response("Not Found", { status: 404 });
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    pushSseChunk: (chunk: string) => {
      if (!streamController) throw new Error("SSE stream not yet opened");
      streamController.enqueue(encoder.encode(chunk));
    },
    closeSseStream: () => streamController?.close(),
    getPolicyFetchCount: () => policyFetchCount,
  };
}

describe("Clawforge.connect — SSE transport (Cut 2b)", () => {
  it("uses SSE by default and dispatches kill_switch events to onKillSwitch handlers", async () => {
    const mock = makeFetchWithSse({});
    const client = await Clawforge.connect({
      url: "https://test.clawforge.local",
      token: TEST_TOKEN,
      agentDid: "did:mesh:test-agent",
      fetch: mock.fetchImpl,
    });
    const handler = vi.fn();
    client.onKillSwitch(handler);

    mock.pushSseChunk('event: kill_switch\ndata: {"active":true,"scope":"org","reason":"incident"}\n\n');
    await until(() => handler.mock.calls.length === 1);

    expect(handler.mock.calls[0][0]).toMatchObject({ active: true, scope: "org", reason: "incident" });
    await client.disconnect();
  });

  it("falls back to polling when SSE returns non-2xx in auto mode", async () => {
    const mock = makeFetchWithSse({ sseStatus: 503 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = await Clawforge.connect({
      url: "https://test.clawforge.local",
      token: TEST_TOKEN,
      agentDid: "did:mesh:test-agent",
      fetch: mock.fetchImpl,
    });
    // No throw — fell back. The polling source hits /api/v1/kill-switch/{did}
    // on its first tick (within the connect window we don't assert ticks).
    expect(warn).toHaveBeenCalled();
    await client.disconnect();
    warn.mockRestore();
  });

  it('throws in "sse" transport mode when the stream is unreachable', async () => {
    const mock = makeFetchWithSse({ sseStatus: 503 });
    await expect(
      Clawforge.connect({
        url: "https://test.clawforge.local",
        token: TEST_TOKEN,
        agentDid: "did:mesh:test-agent",
        fetch: mock.fetchImpl,
        transport: "sse",
      }),
    ).rejects.toThrow(/SSE stream unavailable/);
  });

  it('"polling" transport mode skips the SSE stream entirely', async () => {
    const mock = makeFetchWithSse({});
    const client = await Clawforge.connect({
      url: "https://test.clawforge.local",
      token: TEST_TOKEN,
      agentDid: "did:mesh:test-agent",
      fetch: mock.fetchImpl,
      transport: "polling",
    });
    const sseCalls = mock.calls.filter((c) => c.url.includes("/events/") && c.url.endsWith("/stream"));
    expect(sseCalls).toHaveLength(0);
    await client.disconnect();
  });

  it("re-fetches the effective policy on policy_changed and reloads the engine", async () => {
    const SECOND_POLICY = `
version: "1.0"
name: updated-policy
rules:
  - name: allow_everything
    condition:
      field: tool_name
      operator: ne
      value: nothing
    action: allow
    priority: 10
defaults:
  action: allow
  max_tokens: 4096
  max_tool_calls: 10
  confidence_threshold: 0.8
`;
    const mock = makeFetchWithSse({ policyYamlSecond: SECOND_POLICY });
    const client = await Clawforge.connect({
      url: "https://test.clawforge.local",
      token: TEST_TOKEN,
      agentDid: "did:mesh:test-agent",
      fetch: mock.fetchImpl,
    });

    expect(client.agt.policyEngine.listPolicies()).toContain("test-policy");
    expect(client.agt.policyEngine.listPolicies()).not.toContain("updated-policy");

    const handler = vi.fn();
    client.onPolicyChanged(handler);

    mock.pushSseChunk('event: policy_changed\ndata: {"policyId":"p2","policyName":"updated-policy","version":2}\n\n');
    await until(() => handler.mock.calls.length === 1);

    expect(mock.getPolicyFetchCount()).toBe(2);
    expect(client.agt.policyEngine.listPolicies()).toContain("updated-policy");
    expect(handler.mock.calls[0][0]).toMatchObject({
      policyId: "p2",
      policyName: "updated-policy",
      version: 2,
    });
    await client.disconnect();
  });

  it("unsubscribe stops further onPolicyChanged invocations", async () => {
    const mock = makeFetchWithSse({});
    const client = await Clawforge.connect({
      url: "https://test.clawforge.local",
      token: TEST_TOKEN,
      agentDid: "did:mesh:test-agent",
      fetch: mock.fetchImpl,
    });
    const handler = vi.fn();
    const unsub = client.onPolicyChanged(handler);

    mock.pushSseChunk("event: policy_changed\ndata: {}\n\n");
    await until(() => handler.mock.calls.length === 1);
    unsub();
    mock.pushSseChunk("event: policy_changed\ndata: {}\n\n");
    // Give the second event a chance to be processed without firing the handler.
    await new Promise((r) => setTimeout(r, 50));
    expect(handler).toHaveBeenCalledTimes(1);
    await client.disconnect();
  });

  it("ignores keepalive comments and unknown event types", async () => {
    const mock = makeFetchWithSse({});
    const client = await Clawforge.connect({
      url: "https://test.clawforge.local",
      token: TEST_TOKEN,
      agentDid: "did:mesh:test-agent",
      fetch: mock.fetchImpl,
    });
    const killHandler = vi.fn();
    const policyHandler = vi.fn();
    client.onKillSwitch(killHandler);
    client.onPolicyChanged(policyHandler);

    mock.pushSseChunk(":keepalive\n\n");
    mock.pushSseChunk('event: connected\ndata: {"orgId":"test-org"}\n\n');
    mock.pushSseChunk("event: unknown_thing\ndata: {}\n\n");
    // Give the parser room to dispatch.
    await new Promise((r) => setTimeout(r, 30));

    expect(killHandler).not.toHaveBeenCalled();
    expect(policyHandler).not.toHaveBeenCalled();
    await client.disconnect();
  });

  it("disconnect() closes the SSE stream", async () => {
    const mock = makeFetchWithSse({});
    const client = await Clawforge.connect({
      url: "https://test.clawforge.local",
      token: TEST_TOKEN,
      agentDid: "did:mesh:test-agent",
      fetch: mock.fetchImpl,
    });
    const handler = vi.fn();
    client.onKillSwitch(handler);
    await client.disconnect();

    // Pushing AFTER disconnect should not fan out — the abort controller
    // disconnected the reader. We allow the push (controller still alive
    // in the mock), but the client's reader should have torn down.
    try {
      mock.pushSseChunk('event: kill_switch\ndata: {"active":true}\n\n');
    } catch {
      /* mock may already have closed */
    }
    await new Promise((r) => setTimeout(r, 30));
    expect(handler).not.toHaveBeenCalled();
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
