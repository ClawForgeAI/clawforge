export const PACKAGE_NAME = "@clawforgeai/client";

export { Clawforge, govern, InMemoryKillSwitchSource } from "./client.js";
export { ClawforgeDenied, ClawforgeError, ClawforgeKillSwitchActive, ClawforgeNotConnected } from "./errors.js";
export { HttpClient, HttpError } from "./http.js";
export { AuditBatcher } from "./audit-batcher.js";
export { AuditSpool } from "./audit-spool.js";
export { PollingKillSwitchSource } from "./kill-switch-transport.js";
export { SseEventSource } from "./sse-event-source.js";
export type {
  AuditDraft,
  ClawforgeConnectOptions,
  AuditBatchOptions,
  KillSwitchEvent,
  KillSwitchEventHandler,
  KillSwitchSource,
  OfflineBufferOptions,
  PolicyChangedEvent,
  PolicyChangedHandler,
  PolicyPollOptions,
  Unsubscribe,
} from "./types.js";
