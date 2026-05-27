import { AuditLogger, KillSwitch, PolicyEngine, TrustManager } from "@microsoft/agent-governance-sdk";
import { type AuditEntry, type PolicyDecisionResult, parsePolicyYamlOrThrow } from "@clawforgeai/policy-schema";
import { AuditBatcher } from "./audit-batcher.js";
import { ClawforgeDenied, ClawforgeNotConnected } from "./errors.js";
import { HttpClient } from "./http.js";
import { InMemoryKillSwitchSource, PollingKillSwitchSource } from "./kill-switch-transport.js";
import { convertPolicyToLegacyRules } from "./policy-loader.js";
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
  private readonly policyEngine: PolicyEngine;
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
    policyEngine: PolicyEngine;
    auditLogger: AuditLogger;
    killSwitch: KillSwitch;
    trust: TrustManager;
    auditBatcher: AuditBatcher;
    killSwitchSource: KillSwitchSource;
    agentDid: string;
  }) {
    this.http = args.http;
    this.policyEngine = args.policyEngine;
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

    const http = new HttpClient({ baseUrl: url, token, fetchImpl: options.fetch });
    const policyEngine = new PolicyEngine();
    const auditLogger = new AuditLogger();
    const killSwitch = new KillSwitch({ enabled: true });
    const trust = new TrustManager();

    const auditBatcher = new AuditBatcher({
      transport: async (batch) => {
        await http.post(`/api/v1/audit/${encodeURIComponent(agentDid)}/entries`, batch);
      },
      batch: options.auditBatch,
    });

    const killSwitchSource: KillSwitchSource = options.killSwitchSource ?? new PollingKillSwitchSource(http, agentDid);

    const client = new Clawforge({
      http,
      policyEngine,
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

  /** Local evaluation via the embedded AGT PolicyEngine. */
  async evaluate(action: string, context: Record<string, unknown> = {}): Promise<PolicyDecisionResult> {
    this.assertConnected();
    const decision = this.policyEngine.evaluate(action, {
      tool_name: action,
      ...context,
    });
    return {
      allowed: decision === "allow",
      action: decision === "allow" ? "allow" : decision === "review" ? "require_approval" : "deny",
      approvers: [],
      rateLimited: false,
      evaluatedAt: new Date(),
    };
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
      policyEngine: this.policyEngine,
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
        for (const rule of convertPolicyToLegacyRules(policy)) {
          // AGT PolicyEngine.addRule expects its PolicyRule shape; the legacy
          // subset we produce here is structurally compatible.
          this.policyEngine.addRule(rule as never);
        }
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
