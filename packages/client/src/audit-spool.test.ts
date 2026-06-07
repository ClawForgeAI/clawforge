import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuditEntry } from "@clawforgeai/policy-schema";
import { AuditSpool } from "./audit-spool.js";
import { AuditBatcher } from "./audit-batcher.js";

function makeEntry(i: number): AuditEntry {
  return {
    timestamp: new Date(2026, 0, 1, 0, 0, i).toISOString(),
    agentId: "did:mesh:test",
    action: `act${i}`,
    decision: "allow",
    hash: `hash-${String(i).padStart(2, "0")}`,
    previousHash: i === 0 ? "0".repeat(64) : `hash-${String(i - 1).padStart(2, "0")}`,
  };
}

describe("AuditSpool", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clawforge-spool-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns [] when the spool file doesn't exist", () => {
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    expect(spool.readAll()).toEqual([]);
    expect(spool.size()).toBe(0);
  });

  it("appendSync persists entries that readAll() returns in order", () => {
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    spool.appendSync([makeEntry(0), makeEntry(1)]);
    spool.appendSync([makeEntry(2)]);

    const all = spool.readAll();
    expect(all).toHaveLength(3);
    expect(all.map((e) => e.action)).toEqual(["act0", "act1", "act2"]);
  });

  it("clear() truncates the file", () => {
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    spool.appendSync([makeEntry(0), makeEntry(1)]);
    expect(spool.readAll()).toHaveLength(2);
    spool.clear();
    expect(spool.readAll()).toEqual([]);
  });

  it("a new instance over the same path picks up existing entries (crash recovery)", () => {
    const s1 = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    s1.appendSync([makeEntry(0), makeEntry(1)]);

    const s2 = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    expect(s2.readAll().map((e) => e.action)).toEqual(["act0", "act1"]);
  });

  it("skips corrupted lines and logs a warning (partial write recovery)", () => {
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    spool.appendSync([makeEntry(0)]);
    // Inject a garbage line between two valid entries
    const goodLine = JSON.stringify(makeEntry(1));
    const corruptLine = '{"timestamp":"2026-01-01T00:00:00Z","actio'; // truncated JSON
    writeFileSync(spool.path, readFileSync(spool.path, "utf8") + corruptLine + "\n" + goodLine + "\n");
    const logger = { warn: vi.fn() };
    const recovered = new AuditSpool({ agentDid: "did:mesh:a", path: dir, logger });
    const entries = recovered.readAll();
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.action)).toEqual(["act0", "act1"]);
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(logger.warn.mock.calls[0][0]).toContain("corrupted entry");
  });

  it("drops oldest entries with a warning when maxBytes is exceeded", () => {
    const logger = { warn: vi.fn() };
    // Each entry is ~150 bytes; cap at 250 to force a drop after 2 entries.
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: dir, maxBytes: 250, logger });
    spool.appendSync([makeEntry(0)]);
    spool.appendSync([makeEntry(1)]);
    spool.appendSync([makeEntry(2)]);
    const remaining = spool.readAll();
    expect(remaining.length).toBeLessThan(3);
    expect(logger.warn).toHaveBeenCalled();
    // The newest entry must always make it in.
    expect(remaining[remaining.length - 1].action).toBe("act2");
  });

  it("sanitizes the agentDid in the filename (no directory traversal)", () => {
    const spool = new AuditSpool({ agentDid: "did:mesh:../../bad", path: dir });
    expect(spool.path).toContain(dir);
    expect(spool.path).not.toContain("../");
  });

  it("accepts an explicit .jsonl path", () => {
    const file = join(dir, "custom.jsonl");
    mkdirSync(dir, { recursive: true });
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: file });
    expect(spool.path).toBe(file);
    spool.appendSync([makeEntry(0)]);
    expect(spool.readAll()).toHaveLength(1);
  });
});

describe("AuditBatcher × AuditSpool integration", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "clawforge-batcher-spool-test-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("on transport failure: appends the batch to the spool; on next success: drains spool first", async () => {
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    let failNext = true;
    const delivered: AuditEntry[][] = [];
    const transport = vi.fn(async (batch: AuditEntry[]) => {
      if (failNext) {
        failNext = false;
        throw new Error("transport failed");
      }
      delivered.push(batch);
    });

    const batcher = new AuditBatcher({
      transport,
      batch: { maxEntries: 100, maxMs: 60_000 },
      spool,
    });

    batcher.enqueue(makeEntry(0));
    batcher.enqueue(makeEntry(1));
    await expect(batcher.flush()).rejects.toThrow(/transport failed/);

    // Spool should now hold the failed batch
    expect(spool.readAll().map((e) => e.action)).toEqual(["act0", "act1"]);

    // Enqueue new entries; next flush succeeds → spool drains, in chain order
    batcher.enqueue(makeEntry(2));
    await batcher.flush();

    expect(transport).toHaveBeenCalledTimes(2);
    expect(delivered).toHaveLength(1);
    expect(delivered[0].map((e) => e.action)).toEqual(["act0", "act1", "act2"]);
    expect(spool.readAll()).toEqual([]);
  });

  it("after two consecutive failures, the spool accumulates every batch in chain order", async () => {
    const spool = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    let allowSuccess = false;
    const transport = vi.fn(async () => {
      if (!allowSuccess) throw new Error("down");
    });
    const batcher = new AuditBatcher({
      transport,
      batch: { maxEntries: 100, maxMs: 60_000 },
      spool,
    });

    batcher.enqueue(makeEntry(0));
    await expect(batcher.flush()).rejects.toThrow();
    batcher.enqueue(makeEntry(1));
    await expect(batcher.flush()).rejects.toThrow();

    expect(spool.readAll().map((e) => e.action)).toEqual(["act0", "act1"]);

    allowSuccess = true;
    batcher.enqueue(makeEntry(2));
    await batcher.flush();

    // Final successful transport delivers all three in chain order
    const calls = transport.mock.calls as unknown as AuditEntry[][][];
    const lastBatch: AuditEntry[] = calls.at(-1)?.[0] ?? [];
    expect(lastBatch.map((e) => e.action)).toEqual(["act0", "act1", "act2"]);
    expect(spool.readAll()).toEqual([]);
  });

  it("a fresh batcher process recovers the spool from the previous process", async () => {
    // Simulate process 1: a flush fails and spools the batch, then "crashes".
    const spool1 = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    const batcher1 = new AuditBatcher({
      transport: async () => {
        throw new Error("down");
      },
      batch: { maxEntries: 100, maxMs: 60_000 },
      spool: spool1,
    });
    batcher1.enqueue(makeEntry(0));
    batcher1.enqueue(makeEntry(1));
    await expect(batcher1.flush()).rejects.toThrow();

    // Process 2: fresh spool over the same path, server is back up.
    const delivered: AuditEntry[][] = [];
    const spool2 = new AuditSpool({ agentDid: "did:mesh:a", path: dir });
    const batcher2 = new AuditBatcher({
      transport: async (batch) => {
        delivered.push(batch);
      },
      batch: { maxEntries: 100, maxMs: 60_000 },
      spool: spool2,
    });
    batcher2.enqueue(makeEntry(2));
    await batcher2.flush();

    expect(delivered).toHaveLength(1);
    expect(delivered[0].map((e) => e.action)).toEqual(["act0", "act1", "act2"]);
    expect(spool2.readAll()).toEqual([]);
  });
});
