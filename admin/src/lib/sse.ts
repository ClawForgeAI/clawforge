/**
 * Minimal browser SSE consumer for the admin console.
 *
 * Uses `fetch` streaming (rather than the global `EventSource`) so we can
 * send the JWT bearer token via the `Authorization` header — the native
 * `EventSource` API has no way to attach custom headers in the browser.
 *
 * Returns an `unsubscribe()` function that closes the connection.
 */

import { getApiBase } from "./runtime-config";

export type SseHandler = (event: { event: string; data: string }) => void;

export function subscribeOrgEvents(orgId: string, token: string, onEvent: SseHandler): () => void {
  const controller = new AbortController();
  let cancelled = false;

  void (async () => {
    try {
      const response = await fetch(`${getApiBase()}/api/v1/events/${encodeURIComponent(orgId)}/stream`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "text/event-stream",
        },
        signal: controller.signal,
      });
      if (!response.ok || !response.body) return;

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let eventName = "message";
      let dataLines: string[] = [];

      while (!cancelled) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r\n|\r|\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.length === 0) {
            if (dataLines.length > 0) {
              try {
                onEvent({ event: eventName, data: dataLines.join("\n") });
              } catch {
                /* handler errors must not break the stream */
              }
              dataLines = [];
              eventName = "message";
            }
            continue;
          }
          if (line.startsWith(":")) continue;
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          let value = colon === -1 ? "" : line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "event") eventName = value;
          else if (field === "data") dataLines.push(value);
        }
      }
    } catch {
      // Connection closed or aborted — no-op.
    }
  })();

  return () => {
    cancelled = true;
    controller.abort();
  };
}
