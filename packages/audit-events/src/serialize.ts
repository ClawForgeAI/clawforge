import type { AuditEvent } from "@clawforgeai/contracts";

/** Serialize a batch of audit events to newline-delimited JSON (one event per line). */
export function serializeJsonl(events: AuditEvent[]): string {
  if (events.length === 0) return "";
  return events.map((event) => JSON.stringify(event)).join("\n") + "\n";
}

/**
 * Parse newline-delimited JSON back into events. Malformed lines are skipped
 * (best-effort recovery path used by persistence reloads after a crash).
 */
export function parseJsonl(raw: string): AuditEvent[] {
  if (!raw) return [];
  const events: AuditEvent[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as AuditEvent);
    } catch {
      // Skip malformed lines — recovery is best-effort.
    }
  }
  return events;
}
