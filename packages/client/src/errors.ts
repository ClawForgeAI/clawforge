import type { PolicyDecisionResult } from "@clawforgeai/policy-schema";

export class ClawforgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClawforgeError";
  }
}

export class ClawforgeDenied extends ClawforgeError {
  constructor(public readonly decision: PolicyDecisionResult) {
    super(`Action denied by policy: ${decision.reason ?? decision.matchedRule ?? "no rule matched"}`);
    this.name = "ClawforgeDenied";
  }
}

export class ClawforgeKillSwitchActive extends ClawforgeError {
  constructor(
    public readonly scope: string,
    public readonly reason: string,
  ) {
    super(`Kill switch active for scope "${scope}": ${reason}`);
    this.name = "ClawforgeKillSwitchActive";
  }
}

export class ClawforgeNotConnected extends ClawforgeError {
  constructor() {
    super("Clawforge client is not connected. Call Clawforge.connect() first.");
    this.name = "ClawforgeNotConnected";
  }
}
