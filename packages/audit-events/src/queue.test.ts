import type { AuditEvent } from "@clawforgeai/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchedAuditQueue } from "./queue.js";
import type { AuditPersistence, AuditTransport, BatchedAuditQueueOptions } from "./types.js";

function makeQueue(overrides?: Partial<BatchedAuditQueueOptions>): {
  queue: BatchedAuditQueue;
  transport: ReturnType<typeof vi.fn> & AuditTransport;
  persistence: { load: ReturnType<typeof vi.fn>; save: ReturnType<typeof vi.fn>; clear: ReturnType<typeof vi.fn> };
  logger: { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
} {
  const transport = vi.fn(async () => true) as ReturnType<typeof vi.fn> & AuditTransport;
  const persistence = {
    load: vi.fn(() => [] as AuditEvent[]),
    save: vi.fn(),
    clear: vi.fn(),
  } satisfies AuditPersistence;
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  const queue = new BatchedAuditQueue({
    identity: { userId: "u1", orgId: "o1" },
    transport,
    persistence,
    logger,
    auditLevel: "full",
    batchSize: 100,
    maxBufferSize: 10_000,
    now: () => 1_700_000_000_000,
    ...overrides,
  });

  return { queue, transport, persistence, logger };
}

describe("BatchedAuditQueue", () => {
  describe("enqueue", () => {
    it("attaches identity, timestamp, and outcome to each event", () => {
      const { queue, transport } = makeQueue();

      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed", toolName: "read" });

      expect(queue.bufferSize).toBe(1);
      // flush to see the event that goes to transport
      return queue.flush().then(() => {
        expect(transport).toHaveBeenCalledWith([
          expect.objectContaining({
            userId: "u1",
            orgId: "o1",
            eventType: "tool_call_attempt",
            outcome: "allowed",
            toolName: "read",
            timestamp: 1_700_000_000_000,
          }),
        ]);
      });
    });

    it("no-ops when auditLevel is 'off'", () => {
      const { queue, transport } = makeQueue({ auditLevel: "off" });
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      expect(queue.bufferSize).toBe(0);
      return queue.flush().then(() => expect(transport).not.toHaveBeenCalled());
    });

    it("drops metadata when auditLevel is 'metadata'", async () => {
      const { queue, transport } = makeQueue({ auditLevel: "metadata" });
      queue.enqueue({
        eventType: "tool_call_attempt",
        outcome: "blocked",
        metadata: { reason: "deny_list" },
      });
      await queue.flush();
      expect(transport.mock.calls[0]?.[0][0].metadata).toBeUndefined();
    });

    it("preserves metadata when auditLevel is 'full'", async () => {
      const { queue, transport } = makeQueue();
      queue.enqueue({
        eventType: "tool_call_attempt",
        outcome: "blocked",
        metadata: { reason: "deny_list" },
      });
      await queue.flush();
      expect(transport.mock.calls[0]?.[0][0].metadata).toEqual({ reason: "deny_list" });
    });

    it("setAuditLevel updates behavior at runtime", async () => {
      const { queue, transport } = makeQueue({ auditLevel: "full" });
      queue.setAuditLevel("off");
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      await queue.flush();
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe("overflow", () => {
    it("drops oldest events when bufferSize exceeds maxBufferSize", () => {
      const { queue, logger } = makeQueue({ maxBufferSize: 3, warningThreshold: 0.99 });
      for (let i = 0; i < 5; i++) {
        queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed", toolName: `t${i}` });
      }
      expect(queue.bufferSize).toBe(3);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Dropped"));
    });

    it("emits a single capacity warning once per cycle when over threshold", () => {
      const { queue, logger } = makeQueue({ maxBufferSize: 10, warningThreshold: 0.5 });
      for (let i = 0; i < 6; i++) {
        queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      }
      const warns = logger.warn.mock.calls.filter((args) =>
        String(args[0]).startsWith("Audit buffer approaching capacity"),
      );
      expect(warns).toHaveLength(1);
    });
  });

  describe("shouldFlush", () => {
    it("returns true once batchSize is reached", () => {
      const { queue } = makeQueue({ batchSize: 3 });
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      expect(queue.shouldFlush()).toBe(false);
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      expect(queue.shouldFlush()).toBe(true);
    });
  });

  describe("flush", () => {
    it("calls transport with the drained batch and clears persistence on success", async () => {
      const { queue, transport, persistence } = makeQueue();
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "blocked" });

      await queue.flush();

      expect(transport).toHaveBeenCalledTimes(1);
      expect(transport.mock.calls[0]?.[0]).toHaveLength(2);
      expect(queue.bufferSize).toBe(0);
      expect(persistence.clear).toHaveBeenCalledTimes(1);
      expect(persistence.save).not.toHaveBeenCalled();
    });

    it("requeues the batch and persists on transport failure", async () => {
      const { queue, transport, persistence } = makeQueue();
      transport.mockResolvedValueOnce(false);

      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      await queue.flush();

      expect(queue.bufferSize).toBe(1);
      expect(persistence.save).toHaveBeenCalledTimes(1);
      expect(persistence.clear).not.toHaveBeenCalled();
    });

    it("treats thrown transports as failure and persists", async () => {
      const { queue, persistence, logger, transport } = makeQueue();
      transport.mockRejectedValueOnce(new Error("network"));

      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
      await queue.flush();

      expect(queue.bufferSize).toBe(1);
      expect(persistence.save).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Audit transport threw"));
    });

    it("is a no-op on an empty buffer", async () => {
      const { queue, transport } = makeQueue();
      await queue.flush();
      expect(transport).not.toHaveBeenCalled();
    });
  });

  describe("persistence reload", () => {
    it("loads events from persistence on construction", () => {
      const load = vi.fn(
        () =>
          [
            {
              userId: "u1",
              orgId: "o1",
              eventType: "tool_call_attempt",
              outcome: "allowed",
              timestamp: 1,
            },
          ] as AuditEvent[],
      );
      const queue = new BatchedAuditQueue({
        identity: { userId: "u1", orgId: "o1" },
        transport: async () => true,
        persistence: { load, save: vi.fn(), clear: vi.fn() },
      });

      expect(load).toHaveBeenCalledTimes(1);
      expect(queue.bufferSize).toBe(1);
    });

    it("trims reloaded buffer to maxBufferSize", () => {
      const reload: AuditEvent[] = Array.from({ length: 5 }, (_, i) => ({
        userId: "u1",
        orgId: "o1",
        eventType: "tool_call_attempt",
        outcome: "allowed",
        timestamp: i,
      }));
      const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
      const queue = new BatchedAuditQueue({
        identity: { userId: "u1", orgId: "o1" },
        transport: async () => true,
        persistence: { load: () => reload, save: vi.fn(), clear: vi.fn() },
        maxBufferSize: 2,
        logger,
      });

      expect(queue.bufferSize).toBe(2);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("trimmed"));
    });
  });

  describe("reset", () => {
    let queue: BatchedAuditQueue;
    let clear: () => void;

    beforeEach(() => {
      clear = vi.fn(() => undefined);
      const persistence: AuditPersistence = {
        load: () => [],
        save: vi.fn(),
        clear,
      };
      queue = new BatchedAuditQueue({
        identity: { userId: "u1", orgId: "o1" },
        transport: async () => true,
        persistence,
      });
      queue.enqueue({ eventType: "tool_call_attempt", outcome: "allowed" });
    });

    it("drops buffered events and clears persistence", () => {
      queue.reset();
      expect(queue.bufferSize).toBe(0);
      expect(clear).toHaveBeenCalled();
    });
  });
});
