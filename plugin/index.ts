import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { register } from "./src/index.js";

// ---------------------------------------------------------------------------
// Public SDK — stable types for external consumers
// ---------------------------------------------------------------------------

export type {
  // Configuration
  ClawForgePluginConfig,
  OfflineMode,
  SsoConfig,
  // Policy
  OrgPolicy,
  ApprovedSkill,
  DlpRule,
  DlpAction,
  DlpSeverity,
  DlpViolation,
  DlpScanResult,
  // Session
  SessionTokens,
  // Events
  AuditEventType,
  AuditEvent,
  HeartbeatResponse,
  CachedPolicy,
  // Security scanner
  SkillScanSeverity,
  SkillScanFinding,
  SkillScanSummary,
  SkillScanOptions,
  // Hook registration
  ClawForgeHookContext,
  BeforeToolCallHook,
  AfterToolCallHook,
  ToolEnforcementResult,
} from "./src/sdk.js";

export { SDK_VERSION, MIN_CONTROL_PLANE_VERSION } from "./src/sdk.js";

// ---------------------------------------------------------------------------
// Plugin entry point
// ---------------------------------------------------------------------------

const plugin = {
  id: "clawforge",
  name: "ClawForge",
  description:
    "Enterprise governance layer – SSO authentication, tool policy enforcement, skill approval, audit logging, and kill switch.",
  register(api: OpenClawPluginApi) {
    register(api);
  },
};

export default plugin;
