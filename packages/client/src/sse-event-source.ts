/**
 * Minimal Server-Sent-Events parser built on the fetch streaming API.
 *
 * Chosen over Node's built-in `EventSource` for two reasons:
 *   1. The fetch path lets tests inject a stubbed `fetch` that returns a
 *      ReadableStream — the same mock-server pattern the rest of the
 *      package uses. Node's global EventSource (Node 22+) can't be mocked
 *      the same way.
 *   2. Bearer-token auth via `Authorization` header. EventSource doesn't
 *      support custom headers in the browser; fetch does everywhere.
 *
 * The parser follows the SSE spec at https://html.spec.whatwg.org/#parsing:
 *   - Lines are separated by \n; \r\n and \r also accepted
 *   - Empty line dispatches the buffered event
 *   - `event:` sets the event name (default "message")
 *   - `data:` appends to the data buffer (multi-line allowed)
 *   - `:`-prefixed lines are comments (keepalives) — ignored
 *
 * Not implemented (Cut 3): auto-reconnect with backoff, Last-Event-ID
 * replay. On stream end this class calls `onClose` and stops.
 */

export interface SseEvent {
  event: string;
  data: string;
}

export type SseEventHandler = (event: SseEvent) => void | Promise<void>;

export interface SseEventSourceOptions {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
  /**
   * Optional initial dispatcher. Can be replaced later via `attachDispatcher()`
   * — the client uses that to swap in its own multi-event handler after
   * `start()` resolves and the source is wired into the rest of the runtime.
   */
  onEvent?: SseEventHandler;
  onClose?: (err?: unknown) => void;
}

export class SseEventSource {
  private readonly url: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private dispatcher: SseEventHandler;
  private readonly onClose?: SseEventSourceOptions["onClose"];
  private readonly abort = new AbortController();
  private closed = false;

  constructor(opts: SseEventSourceOptions) {
    this.url = opts.url;
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.dispatcher = opts.onEvent ?? (() => undefined);
    this.onClose = opts.onClose;
  }

  /** Replace the event handler. Used by the client after construction. */
  attachDispatcher(handler: SseEventHandler): void {
    this.dispatcher = handler;
  }

  /**
   * Open the stream. Resolves once the server responds 200 OK with a body —
   * stream consumption then continues in the background. Rejects when the
   * fetch fails, the status is non-2xx, or the response has no body.
   *
   * A caller-supplied AbortSignal is honored: if it fires before/while
   * fetching, `start()` rejects with `AbortError`.
   */
  async start(externalSignal?: AbortSignal): Promise<void> {
    if (externalSignal?.aborted) {
      throw new DOMException("aborted", "AbortError");
    }
    const onExternalAbort = () => this.abort.abort();
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "text/event-stream",
        },
        signal: this.abort.signal,
      });
    } finally {
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }

    if (!response.ok) {
      throw new Error(`SSE connect failed: HTTP ${response.status} ${response.statusText}`);
    }
    if (!response.body) {
      throw new Error("SSE response has no body");
    }

    void this.consume(response.body);
  }

  /** Stop the stream and call `onClose`. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.abort.abort();
    } catch {
      /* AbortController already triggered */
    }
  }

  private async consume(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let eventName = "message";
    let dataLines: string[] = [];

    const dispatch = async () => {
      if (dataLines.length === 0) {
        eventName = "message";
        return;
      }
      const data = dataLines.join("\n");
      const name = eventName;
      dataLines = [];
      eventName = "message";
      try {
        await this.dispatcher({ event: name, data });
      } catch {
        /* handler errors must not break the stream */
      }
    };

    try {
      while (!this.closed) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split(/\r\n|\r|\n/);
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.length === 0) {
            await dispatch();
            continue;
          }
          if (line.startsWith(":")) continue; // comment / keepalive
          const colon = line.indexOf(":");
          const field = colon === -1 ? line : line.slice(0, colon);
          let value = colon === -1 ? "" : line.slice(colon + 1);
          if (value.startsWith(" ")) value = value.slice(1);
          if (field === "event") eventName = value;
          else if (field === "data") dataLines.push(value);
          // `id` and `retry` fields are ignored in Cut 2b
        }
      }
      // Flush a final event if the stream ended without a trailing blank line.
      if (dataLines.length > 0) await dispatch();
      this.onClose?.();
    } catch (err) {
      if (!this.closed) this.onClose?.(err);
    }
  }
}
