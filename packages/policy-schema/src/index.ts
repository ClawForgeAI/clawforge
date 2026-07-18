export const PACKAGE_NAME = "@clawforgeai/policy-schema";

export * from "./zod.js";
export * from "./yaml.js";
export * from "./agt-conformance.js";

// The raw AGT JSON Schema as a typed export — for interop with `agt lint-policy`
// and any tool that wants Draft-07 validation rather than the Zod surface.
import policySchemaJson from "./policy_schema.json" with { type: "json" };
export const policySchema = policySchemaJson;
