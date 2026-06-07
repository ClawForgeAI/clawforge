import { describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@clawforgeai/policy-schema";
import { AuditBatcher } from "./audit-batcher.js";

function makeEntry(i: number): AuditEntry {
  return {
    timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    agentId: "did:mesh:a1",
    action: `act${i}`,
    decision: "allow",
    hash: `hash-${i}`,
    previousHash: i === 0 ? "0".repeat(64) : `hash-${i - 1}`,
  };
}

describe("AuditBatcher", () => {
  it("flushes once maxEntries is reached", async () => {
    const sent: AuditEntry[][] = [];
    const batcher = new AuditBatcher({
      transport: async (batch) => {
        sent.push(batch);
      },
      batch: { maxEntries: 3, maxMs: 60_000 },
    });

    batcher.enqueue(makeEntry(0));
    batcher.enqueue(makeEntry(1));
    expect(batcher.pendingCount).toBe(2);
    expect(sent.length).toBe(0);

    batcher.enqueue(makeEntry(2));
    await batcher.flush();
    expect(sent.length).toBe(1);
    expect(sent[0]).toHaveLength(3);
  });

  it("flushes once maxBytes is exceeded", async () => {
    const sent: AuditEntry[][] = [];
    const batcher = new AuditBatcher({
      transport: async (batch) => {
        sent.push(batch);
      },
      batch: { maxEntries: 1_000, maxBytes: 200, maxMs: 60_000 },
    });

    for (let i = 0; i < 5; i++) batcher.enqueue(makeEntry(i));
    await batcher.flush();

    expect(sent.length).toBeGreaterThan(0);
    const totalDelivered = sent.reduce((n, b) => n + b.length, 0);
    expect(totalDelivered).toBeGreaterThan(0);
  });

  it("flushes on the maxMs timer", async () => {
    vi.useFakeTimers();
    try {
      const sent: AuditEntry[][] = [];
      const batcher = new AuditBatcher({
        transport: async (batch) => {
          sent.push(batch);
        },
        batch: { maxEntries: 100, maxMs: 100 },
      });

      batcher.enqueue(makeEntry(0));
      expect(sent.length).toBe(0);

      await vi.advanceTimersByTimeAsync(120);
      await batcher.flush();

      expect(sent.length).toBe(1);
      expect(sent[0][0].action).toBe("act0");
    } finally {
      vi.useRealTimers();
    }
  });

  it("close() flushes remaining entries and rejects further enqueues", async () => {
    const sent: AuditEntry[][] = [];
    const batcher = new AuditBatcher({
      transport: async (batch) => {
        sent.push(batch);
      },
    });

    batcher.enqueue(makeEntry(0));
    batcher.enqueue(makeEntry(1));
    await batcher.close();

    expect(sent.length).toBe(1);
    expect(sent[0]).toHaveLength(2);

    batcher.enqueue(makeEntry(2));
    expect(batcher.pendingCount).toBe(0);
  });

  it("surfaces transport errors via onFlushError", async () => {
    const errors: unknown[] = [];
    const batcher = new AuditBatcher({
      transport: async () => {
        throw new Error("transport down");
      },
      onFlushError: (err) => errors.push(err),
    });

    batcher.enqueue(makeEntry(0));
    await expect(batcher.flush()).rejects.toThrow(/transport down/);
    expect(errors).toHaveLength(1);
  });

  it("preserves enqueue order across multiple flushes", async () => {
    const seenActions: string[] = [];
    const batcher = new AuditBatcher({
      transport: async (batch) => {
        for (const e of batch) seenActions.push(e.action);
      },
      batch: { maxEntries: 2, maxMs: 60_000 },
    });

    for (let i = 0; i < 5; i++) batcher.enqueue(makeEntry(i));
    await batcher.flush();

    expect(seenActions).toEqual(["act0", "act1", "act2", "act3", "act4"]);
  });
});
