import { describe, expect, it, vi } from "vitest";
import { SseEventSource, type SseEvent } from "./sse-event-source.js";

/**
 * Build a Response whose body is a ReadableStream that emits the given
 * chunks in order, then closes. Used as the return value of a stubbed fetch.
 */
function makeStreamingResponse(chunks: string[], init: ResponseInit = {}): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
    ...init,
  });
}

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

function makeFetch(impl: (input: FetchInput, init?: FetchInit) => Response | Promise<Response>) {
  return impl as unknown as typeof fetch;
}

/**
 * Wait until `predicate()` returns true, polling every microtask. Used to
 * await async parser work without coupling to specific tick counts.
 */
async function until(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("until() timed out");
    await new Promise<void>((r) => setImmediate(r));
  }
}

describe("SseEventSource — parser", () => {
  it("parses a single named event with data", async () => {
    const received: SseEvent[] = [];
    const fetchImpl = makeFetch(() => makeStreamingResponse(["event: kill_switch\n", 'data: {"active":true}\n\n']));
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: (e) => {
        received.push(e);
      },
    });
    await src.start();
    await until(() => received.length === 1);
    expect(received[0]).toEqual({ event: "kill_switch", data: '{"active":true}' });
  });

  it("defaults event name to 'message' when only data is present", async () => {
    const received: SseEvent[] = [];
    const fetchImpl = makeFetch(() => makeStreamingResponse(["data: hello\n\n"]));
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: (e) => {
        received.push(e);
      },
    });
    await src.start();
    await until(() => received.length === 1);
    expect(received[0]).toEqual({ event: "message", data: "hello" });
  });

  it("concatenates multi-line data fields with newlines", async () => {
    const received: SseEvent[] = [];
    const fetchImpl = makeFetch(() => makeStreamingResponse(["data: line-1\n", "data: line-2\n\n"]));
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: (e) => {
        received.push(e);
      },
    });
    await src.start();
    await until(() => received.length === 1);
    expect(received[0].data).toBe("line-1\nline-2");
  });

  it("dispatches multiple events in a single chunk", async () => {
    const received: SseEvent[] = [];
    const fetchImpl = makeFetch(() =>
      makeStreamingResponse(["event: a\ndata: 1\n\nevent: b\ndata: 2\n\nevent: c\ndata: 3\n\n"]),
    );
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: (e) => {
        received.push(e);
      },
    });
    await src.start();
    await until(() => received.length === 3);
    expect(received.map((e) => `${e.event}=${e.data}`)).toEqual(["a=1", "b=2", "c=3"]);
  });

  it("handles events split across multiple chunks", async () => {
    const received: SseEvent[] = [];
    const fetchImpl = makeFetch(() =>
      makeStreamingResponse([
        "event: par",
        "tial\n", // event name split across two chunks
        'data: {"k":',
        '"v"}\n', // data field split across two chunks
        "\n",
      ]),
    );
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: (e) => {
        received.push(e);
      },
    });
    await src.start();
    await until(() => received.length === 1);
    expect(received[0]).toEqual({ event: "partial", data: '{"k":"v"}' });
  });

  it("ignores SSE comments and keepalive lines", async () => {
    const received: SseEvent[] = [];
    const fetchImpl = makeFetch(() =>
      makeStreamingResponse([":keepalive\n\n", "event: real\ndata: payload\n\n", ":another comment\n\n"]),
    );
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: (e) => {
        received.push(e);
      },
    });
    await src.start();
    await until(() => received.length === 1);
    expect(received).toHaveLength(1);
    expect(received[0].event).toBe("real");
  });

  it("sends Authorization and Accept headers", async () => {
    const captured: { url: string; init?: RequestInit } = { url: "" };
    const fetchImpl = makeFetch((input, init) => {
      captured.url = typeof input === "string" ? input : (input as URL).href;
      captured.init = init;
      return makeStreamingResponse([]);
    });
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "abc.def.ghi",
      fetchImpl,
      onEvent: () => undefined,
    });
    await src.start();
    src.close();
    const headers = captured.init?.headers as Record<string, string> | undefined;
    expect(headers?.Authorization).toBe("Bearer abc.def.ghi");
    expect(headers?.Accept).toBe("text/event-stream");
  });

  it("rejects start() when the server returns a non-2xx status", async () => {
    const fetchImpl = makeFetch(() => new Response("nope", { status: 404, statusText: "Not Found" }));
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: () => undefined,
    });
    await expect(src.start()).rejects.toThrow(/HTTP 404/);
  });

  it("rejects start() when the response has no body", async () => {
    const fetchImpl = makeFetch(() => new Response(null, { status: 200 }));
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: () => undefined,
    });
    await expect(src.start()).rejects.toThrow(/no body/i);
  });

  it("rejects start() immediately when the external signal is already aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    const fetchImpl = makeFetch(() => makeStreamingResponse([]));
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: () => undefined,
    });
    await expect(src.start(ac.signal)).rejects.toThrow(/abort/i);
  });

  it("attachDispatcher replaces the handler in-flight", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const fetchImpl = makeFetch(() => {
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(encoder.encode("event: a\ndata: 1\n\n"));
          await gate; // wait until the test swaps the dispatcher
          controller.enqueue(encoder.encode("event: b\ndata: 2\n\n"));
          controller.close();
        },
      });
      return new Response(stream, { status: 200 });
    });

    const initial = vi.fn();
    const replacement = vi.fn();
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: initial,
    });
    await src.start();
    await until(() => initial.mock.calls.length === 1);
    src.attachDispatcher(replacement);
    release();
    await until(() => replacement.mock.calls.length === 1);
    expect(initial).toHaveBeenCalledTimes(1);
    expect(replacement).toHaveBeenCalledTimes(1);
    expect(replacement.mock.calls[0][0]).toEqual({ event: "b", data: "2" });
  });

  it("close() stops the stream and invokes onClose", async () => {
    const onClose = vi.fn();
    const fetchImpl = makeFetch(() => {
      const stream = new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise<void>((r) => setTimeout(r, 500)); // would block forever
          controller.enqueue(new TextEncoder().encode("data: never\n\n"));
        },
      });
      return new Response(stream, { status: 200 });
    });
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: () => undefined,
      onClose,
    });
    await src.start();
    src.close();
    await until(() => onClose.mock.calls.length === 1);
  });

  it("handler exceptions do not break the stream", async () => {
    const received: SseEvent[] = [];
    const fetchImpl = makeFetch(() => makeStreamingResponse(["event: a\ndata: 1\n\nevent: b\ndata: 2\n\n"]));
    const src = new SseEventSource({
      url: "http://x/stream",
      token: "t",
      fetchImpl,
      onEvent: (e) => {
        received.push(e);
        if (e.event === "a") throw new Error("boom");
      },
    });
    await src.start();
    await until(() => received.length === 2);
    expect(received.map((e) => e.event)).toEqual(["a", "b"]);
  });
});
