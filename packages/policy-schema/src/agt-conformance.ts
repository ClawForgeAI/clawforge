export const AGT_SPEC_VERSIONS = {
  "AGENT-OS-POLICY-ENGINE": "1.0",
  "AGENTMESH-IDENTITY-TRUST": "1.0",
  "AUDIT-COMPLIANCE": "1.0",
  "FRAMEWORK-ADAPTER-CONTRACT": "1.0",
  "AGENTMESH-WIRE": "1.0",
  "AGENT-SRE-GOVERNANCE": "1.0",
  "MCP-SECURITY-GATEWAY": "1.0",
  "AGENT-HYPERVISOR-EXECUTION-CONTROL": "1.0",
  "AGENTMESH-TRUST-COORDINATION": "1.0",
} as const;

export type AgtSpecName = keyof typeof AGT_SPEC_VERSIONS;

export const AGT_SDK_VERSION_RANGE = "^3.7.0";

export const POLICY_SCHEMA_ID = "https://github.com/microsoft/agent-governance-toolkit/policy-schema/v1.0";
