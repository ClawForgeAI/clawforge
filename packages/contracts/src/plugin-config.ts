import { z } from "zod";
import { OfflineMode } from "./heartbeat.js";

/**
 * Plugin-side runtime configuration. Loaded via OpenClaw's plugin manifest at
 * `~/.openclaw/openclaw.json`. Unknown fields are tolerated because the
 * OpenClaw config loader passes the entire record through.
 */
export const SsoConfig = z.object({
  issuerUrl: z.string().optional(),
  clientId: z.string().optional(),
});
export type SsoConfig = z.infer<typeof SsoConfig>;

export const ClawForgePluginConfig = z
  .object({
    controlPlaneUrl: z.string().optional(),
    orgId: z.string().optional(),
    sso: SsoConfig.optional(),
    policyCacheTtlMs: z.number().int().optional(),
    heartbeatIntervalMs: z.number().int().optional(),
    heartbeatFailureThreshold: z.number().int().optional(),
    auditBatchSize: z.number().int().optional(),
    auditFlushIntervalMs: z.number().int().optional(),
    offlineMode: OfflineMode.optional(),
    maxAuditBufferSize: z.number().int().optional(),
    sseEnabled: z.boolean().optional(),
  })
  .passthrough();
export type ClawForgePluginConfig = z.infer<typeof ClawForgePluginConfig>;
