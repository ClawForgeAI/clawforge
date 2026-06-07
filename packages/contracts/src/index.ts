export const PACKAGE_NAME = "@clawforgeai/contracts";

// Stable Clawforge-specific shapes (multi-tenancy, runtime, sessions, etc.)
// — kept untouched per addendum §A3.
export * from "./common.js";
export * from "./heartbeat.js";
export * from "./session.js";
export * from "./runtime.js";
export * from "./plugin-config.js";

// AGT-shaped wire schemas (Policy / AuditEntry / Identity / Trust).
// Source of truth lives in @clawforgeai/policy-schema; this re-export is the
// recommended import path for governance shapes going forward.
export * from "./agt.js";

// Legacy types (OrgPolicy / DlpRule / AuditEvent / ApprovalRequest etc.).
// Flagged @deprecated in their source files; consumers migrate to AGT
// shapes in subsequent Cut 1 steps. Removal: Cut 1 step 10.
export * from "./policy.js";
export * from "./audit.js";
export * from "./approvals.js";
