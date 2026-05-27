export const PACKAGE_NAME = "@clawforgeai/client";

export { Clawforge, govern, InMemoryKillSwitchSource } from "./client.js";
export { ClawforgeDenied, ClawforgeError, ClawforgeKillSwitchActive, ClawforgeNotConnected } from "./errors.js";
export { HttpClient, HttpError } from "./http.js";
export { AuditBatcher } from "./audit-batcher.js";
export { PollingKillSwitchSource } from "./kill-switch-transport.js";
export type {
  AuditDraft,
  ClawforgeConnectOptions,
  AuditBatchOptions,
  KillSwitchEvent,
  KillSwitchEventHandler,
  KillSwitchSource,
  OfflineBufferOptions,
  PolicyPollOptions,
  Unsubscribe,
} from "./types.js";
