import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { AuditLogger } from "./audit-logger.js";
import type { ClawForgePluginConfig, SessionTokens } from "../types.js";

const CLAWFORGE_DIR = path.join(os.homedir(), ".openclaw", "clawforge");
const BUFFER_FILE = path.join(CLAWFORGE_DIR, "audit-buffer.jsonl");

function makeConfig(overrides?: Partial<ClawForgePluginConfig>): ClawForgePluginConfig {
  return {
    controlPlaneUrl: "https://clawforge.example.com",
    orgId: "org-123",
    auditBatchSize: 5,
    auditFlushIntervalMs: 60_000,
    ...overrides,
  };
}

function makeSession(): SessionTokens {
  return {
    accessToken: "test-token",
    userId: "user-1",
    orgId: "org-123",
  };
}

describe("AuditLogger", () => {
  let originalBuffer: string | null = null;

  beforeEach(() => {
    try {
      originalBuffer = fs.readFileSync(BUFFER_FILE, "utf-8");
    } catch {
      originalBuffer = null;
    }
    // Clear any existing buffer.
    try {
      fs.unlinkSync(BUFFER_FILE);
    } catch {
      // Ignore.
    }
  });

  afterEach(() => {
    if (originalBuffer !== null) {
      fs.writeFileSync(BUFFER_FILE, originalBuffer);
    } else {
      try {
        fs.unlinkSync(BUFFER_FILE);
      } catch {
        // Ignore.
      }
    }
  });

  it("does not enqueue events when auditLevel is off", () => {
    const logger = new AuditLogger({
      config: makeConfig(),
      session: makeSession(),
      auditLevel: "off",
    });

    logger.enqueue({
      eventType: "tool_call_attempt",
      toolName: "exec",
      outcome: "allowed",
    });

    // Since level is off, nothing should be buffered.
    expect(logger.bufferSize).toBe(0);
  });

  it("enqueues events when auditLevel is metadata", () => {
    const logger = new AuditLogger({
      config: makeConfig({ controlPlaneUrl: undefined }),
      session: makeSession(),
      auditLevel: "metadata",
    });

    logger.enqueue({
      eventType: "tool_call_attempt",
      toolName: "exec",
      outcome: "allowed",
      metadata: { should: "be-stripped" },
    });

    expect(logger.bufferSize).toBe(1);
  });

  it("includes metadata only when auditLevel is full", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const logger = new AuditLogger({
      config: makeConfig(),
      session: makeSession(),
      auditLevel: "full",
    });

    logger.enqueue({
      eventType: "tool_call_attempt",
      toolName: "exec",
      outcome: "allowed",
      metadata: { detail: "included-in-full" },
    });

    await logger.flush();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.events[0].metadata).toEqual({ detail: "included-in-full" });

    vi.unstubAllGlobals();
  });

  it("strips metadata when auditLevel is metadata", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchSpy);

    const logger = new AuditLogger({
      config: makeConfig(),
      session: makeSession(),
      auditLevel: "metadata",
    });

    logger.enqueue({
      eventType: "tool_call_attempt",
      toolName: "exec",
      outcome: "allowed",
      metadata: { detail: "should-not-appear" },
    });

    await logger.flush();

    const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
    expect(body.events[0].metadata).toBeUndefined();

    vi.unstubAllGlobals();
  });

  it("persists buffer to disk when fetch fails", async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchSpy);

    const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const logger = new AuditLogger({
      config: makeConfig(),
      session: makeSession(),
      auditLevel: "metadata",
      logger: mockLogger,
    });

    logger.enqueue({
      eventType: "tool_call_attempt",
      toolName: "exec",
      outcome: "allowed",
    });

    await logger.flush();

    // Buffer should be persisted to disk.
    expect(fs.existsSync(BUFFER_FILE)).toBe(true);
    const lines = fs.readFileSync(BUFFER_FILE, "utf-8").trim().split("\n");
    expect(lines.length).toBeGreaterThanOrEqual(1);

    vi.unstubAllGlobals();
  });

  it("loads persisted buffer on construction", () => {
    // Write a pre-existing buffer file.
    fs.mkdirSync(CLAWFORGE_DIR, { recursive: true });
    const event = JSON.stringify({
      userId: "user-1",
      orgId: "org-123",
      eventType: "tool_call_attempt",
      toolName: "read",
      timestamp: Date.now(),
      outcome: "allowed",
    });
    fs.writeFileSync(BUFFER_FILE, event + "\n");

    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal("fetch", fetchSpy);

    const logger = new AuditLogger({
      config: makeConfig(),
      session: makeSession(),
      auditLevel: "metadata",
    });

    // The persisted event should be loaded into the buffer.
    expect(logger.bufferSize).toBe(1);

    vi.unstubAllGlobals();
  });

  describe("buffer limits", () => {
    it("exposes bufferSize and bufferCapacity", () => {
      const logger = new AuditLogger({
        config: makeConfig({ maxAuditBufferSize: 500 }),
        session: makeSession(),
        auditLevel: "metadata",
      });

      expect(logger.bufferSize).toBe(0);
      expect(logger.bufferCapacity).toBe(500);
    });

    it("uses default maxAuditBufferSize of 10000 when not configured", () => {
      const logger = new AuditLogger({
        config: makeConfig(),
        session: makeSession(),
        auditLevel: "metadata",
      });

      expect(logger.bufferCapacity).toBe(10_000);
    });

    it("drops oldest events when buffer exceeds maxAuditBufferSize", () => {
      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const logger = new AuditLogger({
        config: makeConfig({ maxAuditBufferSize: 5, auditBatchSize: 100 }),
        session: makeSession(),
        auditLevel: "metadata",
        logger: mockLogger,
      });

      // Enqueue 7 events (exceeds limit of 5).
      for (let i = 0; i < 7; i++) {
        logger.enqueue({
          eventType: "tool_call_attempt",
          toolName: `tool-${i}`,
          outcome: "allowed",
        });
      }

      // Buffer should be capped at 5.
      expect(logger.bufferSize).toBe(5);

      // Should have warned about exceeding buffer.
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("exceeded max size"),
      );
    });

    it("warns when buffer approaches 80% capacity", () => {
      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const logger = new AuditLogger({
        config: makeConfig({ maxAuditBufferSize: 10, auditBatchSize: 100 }),
        session: makeSession(),
        auditLevel: "metadata",
        logger: mockLogger,
      });

      // Enqueue 9 events (90% of 10).
      for (let i = 0; i < 9; i++) {
        logger.enqueue({
          eventType: "tool_call_attempt",
          toolName: `tool-${i}`,
          outcome: "allowed",
        });
      }

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining("approaching capacity"),
      );
    });

    it("does not warn below 80% capacity", () => {
      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const logger = new AuditLogger({
        config: makeConfig({ maxAuditBufferSize: 100, auditBatchSize: 200 }),
        session: makeSession(),
        auditLevel: "metadata",
        logger: mockLogger,
      });

      // Enqueue 50 events (50% of 100).
      for (let i = 0; i < 50; i++) {
        logger.enqueue({
          eventType: "tool_call_attempt",
          toolName: `tool-${i}`,
          outcome: "allowed",
        });
      }

      // No capacity warning should have been emitted.
      const capacityWarnings = mockLogger.warn.mock.calls.filter(
        (call: string[]) => call[0].includes("approaching capacity"),
      );
      expect(capacityWarnings.length).toBe(0);
    });

    it("enforces buffer limit when events are re-added after failed flush", async () => {
      const fetchSpy = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const logger = new AuditLogger({
        config: makeConfig({ maxAuditBufferSize: 5, auditBatchSize: 100 }),
        session: makeSession(),
        auditLevel: "metadata",
        logger: mockLogger,
      });

      // Enqueue 5 events at limit.
      for (let i = 0; i < 5; i++) {
        logger.enqueue({
          eventType: "tool_call_attempt",
          toolName: `tool-${i}`,
          outcome: "allowed",
        });
      }

      // Flush fails, events go back to buffer.
      await logger.flush();

      // Buffer should still be at max.
      expect(logger.bufferSize).toBeLessThanOrEqual(5);

      vi.unstubAllGlobals();
    });

    it("flushes events in order on reconnection", async () => {
      let flushCount = 0;
      const fetchSpy = vi.fn().mockImplementation(() => {
        flushCount++;
        if (flushCount === 1) {
          return Promise.reject(new Error("Network error"));
        }
        return Promise.resolve({ ok: true, json: async () => ({}) });
      });
      vi.stubGlobal("fetch", fetchSpy);

      const mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const logger = new AuditLogger({
        config: makeConfig({ maxAuditBufferSize: 100, auditBatchSize: 100 }),
        session: makeSession(),
        auditLevel: "full",
        logger: mockLogger,
      });

      // Enqueue events with numbered metadata so we can check order.
      for (let i = 0; i < 3; i++) {
        logger.enqueue({
          eventType: "tool_call_attempt",
          toolName: `tool-${i}`,
          outcome: "allowed",
          metadata: { order: i },
        });
      }

      // First flush fails.
      await logger.flush();

      // Second flush succeeds.
      await logger.flush();

      // Check that the second call contained events in order.
      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1].body);
      expect(body.events[0].metadata.order).toBe(0);
      expect(body.events[1].metadata.order).toBe(1);
      expect(body.events[2].metadata.order).toBe(2);

      vi.unstubAllGlobals();
    });

    it("enforces buffer limit on persisted buffer load", () => {
      // Write 10 events to disk.
      fs.mkdirSync(CLAWFORGE_DIR, { recursive: true });
      const events = Array.from({ length: 10 }, (_, i) =>
        JSON.stringify({
          userId: "user-1",
          orgId: "org-123",
          eventType: "tool_call_attempt",
          toolName: `tool-${i}`,
          timestamp: Date.now(),
          outcome: "allowed",
        }),
      );
      fs.writeFileSync(BUFFER_FILE, events.join("\n") + "\n");

      // Create logger with limit of 5.
      const logger = new AuditLogger({
        config: makeConfig({ maxAuditBufferSize: 5 }),
        session: makeSession(),
        auditLevel: "metadata",
      });

      // Should be capped at 5.
      expect(logger.bufferSize).toBe(5);
    });
  });
});
