import { AuditLogger, KillSwitch, type PolicyEngine, TrustManager } from "@microsoft/agent-governance-sdk";
import { type AuditEntry, type PolicyDecisionResult, parsePolicyYamlOrThrow } from "@clawforgeai/policy-schema";
import { ClawforgeEvaluator } from "@clawforgeai/policy-engine";
import { AuditBatcher } from "./audit-batcher.js";
import { ClawforgeDenied, ClawforgeNotConnected } from "./errors.js";
import { HttpClient } from "./http.js";
import { InMemoryKillSwitchSource, PollingKillSwitchSource } from "./kill-switch-transport.js";
import type {
  AuditDraft,
  ClawforgeConnectOptions,
  KillSwitchEvent,
  KillSwitchEventHandler,
  KillSwitchSource,
  Unsubscribe,
} from "./types.js";

interface ResolvedOptions {
  url: string;
  token: string;
  agentDid: string;
  options: ClawforgeConnectOptions;
}

/**
 * Decode the orgId claim from a JWT bearer token. The Clawforge server scopes
 * audit and policy resources by orgId in the URL path; the client extracts
 * it from the bearer rather than making the customer pass it explicitly.
 */
function extractOrgIdFromJwt(token: string): string {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Clawforge.connect(): token does not look like a JWT");
  }
  let payload: Record<string, unknown>;
  try {
    // base64url -> base64 -> JSON
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    payload = JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch (err) {
    throw new Error(`Clawforge.connect(): failed to decode JWT payload — ${(err as Error).message}`);
  }
  const orgId = payload.orgId;
  if (typeof orgId !== "string" || orgId.length === 0) {
    throw new Error("Clawforge.connect(): JWT missing required `orgId` claim");
  }
  return orgId;
}

function resolveOptions(input?: ClawforgeConnectOptions): ResolvedOptions {
  const opts = input ?? {};
  const url = opts.url ?? process.env.CLAWFORGE_URL;
  const token = opts.token ?? process.env.CLAWFORGE_TOKEN;
  const agentDid = opts.agentDid ?? process.env.CLAWFORGE_AGENT_DID;
  const missing: string[] = [];
  if (!url) missing.push("url (or CLAWFORGE_URL)");
  if (!token) missing.push("token (or CLAWFORGE_TOKEN)");
  if (!agentDid) missing.push("agentDid (or CLAWFORGE_AGENT_DID)");
  if (missing.length > 0) {
    throw new Error(`Clawforge.connect() missing required options: ${missing.join(", ")}`);
  }
  return { url: url as string, token: token as string, agentDid: agentDid as string, options: opts };
}

export class Clawforge {
  private readonly http: HttpClient;
  private readonly evaluator: ClawforgeEvaluator;
  private readonly auditLogger: AuditLogger;
  private readonly killSwitch: KillSwitch;
  private readonly trust: TrustManager;
  private readonly auditBatcher: AuditBatcher;
  private readonly killSwitchSource: KillSwitchSource;
  private readonly agentDidValue: string;
  private readonly killSwitchHandlers = new Set<KillSwitchEventHandler>();
  private disconnected = false;

  private constructor(args: {
    http: HttpClient;
    evaluator: ClawforgeEvaluator;
    auditLogger: AuditLogger;
    killSwitch: KillSwitch;
    trust: TrustManager;
    auditBatcher: AuditBatcher;
    killSwitchSource: KillSwitchSource;
    agentDid: string;
  }) {
    this.http = args.http;
    this.evaluator = args.evaluator;
    this.auditLogger = args.auditLogger;
    this.killSwitch = args.killSwitch;
    this.trust = args.trust;
    this.auditBatcher = args.auditBatcher;
    this.killSwitchSource = args.killSwitchSource;
    this.agentDidValue = args.agentDid;
  }

  /** Public entry point — see §A20 for usage. */
  static async connect(input?: ClawforgeConnectOptions): Promise<Clawforge> {
    const { url, token, agentDid, options } = resolveOptions(input);
    const orgId = extractOrgIdFromJwt(token);

    const http = new HttpClient({ baseUrl: url, token, fetchImpl: options.fetch });
    const evaluator = new ClawforgeEvaluator();
    const auditLogger = new AuditLogger();
    const killSwitch = new KillSwitch({ enabled: true });
    const trust = new TrustManager();

    const auditBatcher = new AuditBatcher({
      transport: async (batch) => {
        await http.post(`/api/v1/audit/${encodeURIComponent(orgId)}/entries`, batch);
      },
      batch: options.auditBatch,
    });

    const killSwitchSource: KillSwitchSource = options.killSwitchSource ?? new PollingKillSwitchSource(http, agentDid);

    const client = new Clawforge({
      http,
      evaluator,
      auditLogger,
      killSwitch,
      trust,
      auditBatcher,
      killSwitchSource,
      agentDid,
    });

    await client.loadEffectivePolicy(options.signal);
    client.startKillSwitchSource();

    return client;
  }

  get agentDid(): string {
    return this.agentDidValue;
  }

  /** Local evaluation via the embedded AGT PolicyEngine (wrapped by ClawforgeEvaluator). */
  async evaluate(action: string, context: Record<string, unknown> = {}): Promise<PolicyDecisionResult> {
    this.assertConnected();
    return this.evaluator.evaluate(action, context);
  }

  /** Enqueue an audit entry. The hash chain is computed locally via AGT AuditLogger. */
  audit(draft: AuditDraft): AuditEntry {
    this.assertConnected();
    const entry = this.auditLogger.log({
      agentId: draft.agentId,
      action: draft.action,
      decision: draft.decision,
    }) as AuditEntry;
    this.auditBatcher.enqueue(entry);
    return entry;
  }

  /** Subscribe to kill-switch events. Returns an unsubscribe function. */
  onKillSwitch(handler: KillSwitchEventHandler): Unsubscribe {
    this.killSwitchHandlers.add(handler);
    return () => {
      this.killSwitchHandlers.delete(handler);
    };
  }

  /** Wrap a tool function with evaluate-then-execute-then-audit semantics. */
  govern<Args extends unknown[], Result>(
    toolFn: (...args: Args) => Result | Promise<Result>,
    actionName?: string,
  ): (...args: Args) => Promise<Result> {
    const name = actionName ?? toolFn.name ?? "anonymous_tool";
    return async (...args: Args): Promise<Result> => {
      const decision = await this.evaluate(name, { args });
      if (!decision.allowed) {
        this.audit({
          agentId: this.agentDidValue,
          action: name,
          decision: "deny",
        });
        throw new ClawforgeDenied(decision);
      }
      const result = await toolFn(...args);
      this.audit({
        agentId: this.agentDidValue,
        action: name,
        decision: "allow",
      });
      return result;
    };
  }

  /** Escape hatch — raw AGT primitives, pre-wired and ready. */
  get agt(): {
    policyEngine: PolicyEngine;
    auditLogger: AuditLogger;
    killSwitch: KillSwitch;
    trust: TrustManager;
  } {
    return {
      policyEngine: this.evaluator.agt,
      auditLogger: this.auditLogger,
      killSwitch: this.killSwitch,
      trust: this.trust,
    };
  }

  /** Flushes pending audit and shuts down background work. */
  async disconnect(): Promise<void> {
    if (this.disconnected) return;
    this.disconnected = true;
    this.killSwitchSource.stop();
    this.killSwitchHandlers.clear();
    await this.auditBatcher.close();
  }

  /** Fetch the effective AGT YAML policy and load it into the engine. */
  private async loadEffectivePolicy(signal?: AbortSignal): Promise<void> {
    try {
      const yaml = await this.http.request<string>({
        method: "GET",
        path: `/api/v1/policies/effective?agentDid=${encodeURIComponent(this.agentDidValue)}`,
        signal,
      });
      if (typeof yaml === "string" && yaml.trim().length > 0) {
        const policy = parsePolicyYamlOrThrow(yaml);
        this.evaluator.loadPolicy(policy);
      }
    } catch (err) {
      // First-boot fail-open with empty policy. The server-side fail-closed
      // default takes over on the next dry-run / poll.
      console.warn(`Clawforge.connect: could not load effective policy: ${String(err)}`);
    }
  }

  private startKillSwitchSource(): void {
    this.killSwitchSource.start(async (event: KillSwitchEvent) => {
      for (const handler of this.killSwitchHandlers) {
        try {
          await handler(event);
        } catch {
          // Handler errors must not break the source.
        }
      }
    });
  }

  private assertConnected(): void {
    if (this.disconnected) throw new ClawforgeNotConnected();
  }
}

/** Standalone `govern()` for the laziest case — builds a transient client. */
export async function govern<Args extends unknown[], Result>(
  toolFn: (...args: Args) => Result | Promise<Result>,
  options?: ClawforgeConnectOptions & { actionName?: string },
): Promise<(...args: Args) => Promise<Result>> {
  const client = await Clawforge.connect(options);
  return client.govern(toolFn, options?.actionName);
}

export { InMemoryKillSwitchSource };
