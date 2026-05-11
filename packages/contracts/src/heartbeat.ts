import { z } from "zod";

/**
 * Response body returned by `GET /api/v1/heartbeat/:orgId/:userId`.
 * Drives the plugin's kill-switch state machine and triggers a policy
 * refresh when the control plane bumps the policy version.
 */
export const HeartbeatResponse = z.object({
  policyVersion: z.number().int(),
  killSwitch: z.boolean(),
  killSwitchMessage: z.string().optional(),
  refreshPolicyNow: z.boolean(),
});
export type HeartbeatResponse = z.infer<typeof HeartbeatResponse>;

export const OfflineMode = z.enum(["block", "allow", "cached"]);
export type OfflineMode = z.infer<typeof OfflineMode>;
