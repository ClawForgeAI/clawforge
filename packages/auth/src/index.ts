export const PACKAGE_NAME = "@clawforgeai/auth";

export * from "./identities.js";
export * from "./jwt.js";
export * from "./api-key.js";

// Re-export the session shape from contracts so adapters can grab it from one
// place when they handle auth flows.
export type { SessionTokens } from "@clawforgeai/contracts";
