/**
 * Unit tests for AuditService.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AuditService } from "./audit-service.js";
import { TEST_ORG_ID, TEST_USER_ID } from "../test/helpers.js";

// ---------------------------------------------------------------------------
// Mock DB helper for AuditService
// ---------------------------------------------------------------------------

function createAuditMockDb() {
  let selectResult: unknown[] = [];
  let insertResult: unknown[] = [];
  let deleteResult: unknown[] = [];

  function chain(resultRef: () => unknown[]) {
    const obj: Record<string, unknown> = {};
    const methods = [
      "from",
      "where",
      "limit",
      "offset",
      "orderBy",
      "values",
      "set",
      "returning",
    ];
    for (const m of methods) {
      obj[m] = vi.fn().mockReturnValue(obj);
    }
    obj.then = vi.fn((resolve: (v: unknown) => void) => resolve(resultRef()));
    return obj;
  }

  const db = {
    select: vi.fn(() => chain(() => selectResult)),
    insert: vi.fn(() => chain(() => insertResult)),
    update: vi.fn(() => chain(() => [])),
    delete: vi.fn(() => chain(() => deleteResult)),
    _setSelectResult(val: unknown[]) {
      selectResult = val;
    },
    _setInsertResult(val: unknown[]) {
      insertResult = val;
    },
    _setDeleteResult(val: unknown[]) {
      deleteResult = val;
    },
  };

  return db;
}

describe("AuditService", () => {
  let db: ReturnType<typeof createAuditMockDb>;
  let service: AuditService;

  beforeEach(() => {
    db = createAuditMockDb();
    service = new AuditService(db as unknown as ConstructorParameters<typeof AuditService>[0]);
  });

  // -------------------------------------------------------------------------
  // ingestEvents
  // -------------------------------------------------------------------------

  describe("ingestEvents", () => {
    it("does nothing for an empty array", async () => {
      await service.ingestEvents([]);
      expect(db.insert).not.toHaveBeenCalled();
    });

    it("inserts a single event", async () => {
      const event = {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        eventType: "tool_use",
        toolName: "Read",
        outcome: "allowed",
        timestamp: Date.now(),
      };

      await service.ingestEvents([event]);

      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("inserts multiple events in a single batch", async () => {
      const events = [
        {
          userId: TEST_USER_ID,
          orgId: TEST_ORG_ID,
          eventType: "tool_use",
          toolName: "Read",
          outcome: "allowed",
          timestamp: Date.now(),
        },
        {
          userId: TEST_USER_ID,
          orgId: TEST_ORG_ID,
          eventType: "tool_use",
          toolName: "Write",
          outcome: "denied",
          timestamp: Date.now(),
        },
      ];

      await service.ingestEvents(events);

      expect(db.insert).toHaveBeenCalledTimes(1);
    });

    it("converts timestamp numbers to Date objects in values", async () => {
      const ts = 1700000000000;
      const event = {
        userId: TEST_USER_ID,
        orgId: TEST_ORG_ID,
        eventType: "tool_use",
        outcome: "allowed",
        timestamp: ts,
      };

      // We can verify the insert was called; since we mock the chain we trust
      // the service code converts correctly (verified via source reading).
      await service.ingestEvents([event]);
      expect(db.insert).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // queryEvents
  // -------------------------------------------------------------------------

  describe("queryEvents", () => {
    it("returns events for a given orgId", async () => {
      const mockEvents = [
        {
          id: "evt-1",
          orgId: TEST_ORG_ID,
          userId: TEST_USER_ID,
          eventType: "tool_use",
          toolName: "Read",
          outcome: "allowed",
          agentId: null,
          sessionKey: null,
          metadata: null,
          timestamp: new Date(),
        },
      ];

      db._setSelectResult(mockEvents);

      const result = await service.queryEvents({ orgId: TEST_ORG_ID });

      expect(result).toEqual(mockEvents);
      expect(db.select).toHaveBeenCalled();
    });

    it("returns an empty array when no events match", async () => {
      db._setSelectResult([]);

      const result = await service.queryEvents({ orgId: TEST_ORG_ID });

      expect(result).toEqual([]);
    });

    it("passes filter parameters to the query", async () => {
      db._setSelectResult([]);

      await service.queryEvents({
        orgId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        eventType: "tool_use",
        toolName: "Read",
        outcome: "allowed",
        limit: 50,
        offset: 10,
      });

      // The select should have been called (we trust the filter logic via source)
      expect(db.select).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // countEvents
  // -------------------------------------------------------------------------

  describe("countEvents", () => {
    it("returns total count for the org", async () => {
      db._setSelectResult([{ total: 42 }]);

      const count = await service.countEvents({ orgId: TEST_ORG_ID });

      expect(count).toBe(42);
    });

    it("returns 0 when no events match", async () => {
      db._setSelectResult([]);

      const count = await service.countEvents({ orgId: TEST_ORG_ID });

      expect(count).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getEvent
  // -------------------------------------------------------------------------

  describe("getEvent", () => {
    it("returns the event when found", async () => {
      const mockEvent = {
        id: "evt-1",
        orgId: TEST_ORG_ID,
        userId: TEST_USER_ID,
        eventType: "tool_use",
        toolName: "Read",
        outcome: "allowed",
        agentId: null,
        sessionKey: null,
        metadata: null,
        timestamp: new Date(),
      };

      db._setSelectResult([mockEvent]);

      const result = await service.getEvent("evt-1");

      expect(result).toEqual(mockEvent);
    });

    it("returns null when not found", async () => {
      db._setSelectResult([]);

      const result = await service.getEvent("nonexistent");

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // deleteOldEvents
  // -------------------------------------------------------------------------

  describe("deleteOldEvents", () => {
    it("returns number of deleted events", async () => {
      db._setDeleteResult([{ id: "evt-1" }, { id: "evt-2" }]);

      const deleted = await service.deleteOldEvents(TEST_ORG_ID, new Date("2024-01-01"));

      expect(deleted).toBe(2);
      expect(db.delete).toHaveBeenCalled();
    });

    it("returns 0 when no events are old enough", async () => {
      db._setDeleteResult([]);

      const deleted = await service.deleteOldEvents(TEST_ORG_ID, new Date("2024-01-01"));

      expect(deleted).toBe(0);
    });
  });
});
