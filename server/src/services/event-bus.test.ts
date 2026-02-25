import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventBus, type SSEClient } from "./event-bus.js";

/**
 * Create a mock SSEClient with a writable raw reply.
 */
function makeMockClient(orgId: string, userId: string): SSEClient & { written: string[] } {
  const written: string[] = [];
  return {
    orgId,
    userId,
    written,
    reply: {
      raw: {
        write: vi.fn((data: string) => {
          written.push(data);
          return true;
        }),
      },
    } as unknown as SSEClient["reply"],
  };
}

describe("EventBus", () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  describe("addClient", () => {
    it("registers a client and increments the count", () => {
      const client = makeMockClient("org-1", "user-1");
      bus.addClient(client);
      expect(bus.getClientCount("org-1")).toBe(1);
    });

    it("supports multiple clients in the same org", () => {
      const c1 = makeMockClient("org-1", "user-1");
      const c2 = makeMockClient("org-1", "user-2");
      bus.addClient(c1);
      bus.addClient(c2);
      expect(bus.getClientCount("org-1")).toBe(2);
    });

    it("isolates clients across orgs", () => {
      const c1 = makeMockClient("org-1", "user-1");
      const c2 = makeMockClient("org-2", "user-2");
      bus.addClient(c1);
      bus.addClient(c2);
      expect(bus.getClientCount("org-1")).toBe(1);
      expect(bus.getClientCount("org-2")).toBe(1);
    });
  });

  describe("removeClient", () => {
    it("removes a specific client", () => {
      const client = makeMockClient("org-1", "user-1");
      bus.addClient(client);
      bus.removeClient(client);
      expect(bus.getClientCount("org-1")).toBe(0);
    });

    it("only removes the specified client, leaving others", () => {
      const c1 = makeMockClient("org-1", "user-1");
      const c2 = makeMockClient("org-1", "user-2");
      bus.addClient(c1);
      bus.addClient(c2);
      bus.removeClient(c1);
      expect(bus.getClientCount("org-1")).toBe(1);
    });

    it("cleans up org entry when last client is removed", () => {
      const client = makeMockClient("org-1", "user-1");
      bus.addClient(client);
      bus.removeClient(client);
      // After removal, getClientCount should return 0 (no leftover map entry).
      expect(bus.getClientCount("org-1")).toBe(0);
    });

    it("does nothing when removing a client from an unknown org", () => {
      const client = makeMockClient("org-unknown", "user-1");
      // Should not throw.
      bus.removeClient(client);
      expect(bus.getClientCount("org-unknown")).toBe(0);
    });
  });

  describe("broadcast", () => {
    it("sends SSE-formatted data to all clients in the org", () => {
      const c1 = makeMockClient("org-1", "user-1");
      const c2 = makeMockClient("org-1", "user-2");
      bus.addClient(c1);
      bus.addClient(c2);

      bus.broadcast("org-1", "kill_switch", { active: true, message: "Emergency" });

      const expected = `event: kill_switch\ndata: ${JSON.stringify({ active: true, message: "Emergency" })}\n\n`;
      expect(c1.written).toContain(expected);
      expect(c2.written).toContain(expected);
    });

    it("does not send to clients in other orgs", () => {
      const c1 = makeMockClient("org-1", "user-1");
      const c2 = makeMockClient("org-2", "user-2");
      bus.addClient(c1);
      bus.addClient(c2);

      bus.broadcast("org-1", "policy_updated", { version: 3 });

      expect(c1.written.length).toBe(1);
      expect(c2.written.length).toBe(0);
    });

    it("does nothing when broadcasting to an org with no clients", () => {
      // Should not throw.
      bus.broadcast("org-empty", "kill_switch", { active: false });
    });

    it("removes a client if write throws (disconnected client)", () => {
      const client = makeMockClient("org-1", "user-1");
      // Simulate a broken connection.
      (client.reply.raw.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Connection reset");
      });

      bus.addClient(client);
      expect(bus.getClientCount("org-1")).toBe(1);

      bus.broadcast("org-1", "kill_switch", { active: true });
      expect(bus.getClientCount("org-1")).toBe(0);
    });

    it("sends proper SSE format with event name and JSON data", () => {
      const client = makeMockClient("org-1", "user-1");
      bus.addClient(client);

      bus.broadcast("org-1", "policy_updated", { version: 5 });

      expect(client.written[0]).toBe(
        "event: policy_updated\ndata: {\"version\":5}\n\n",
      );
    });
  });

  describe("getClientCount", () => {
    it("returns 0 for an org with no clients", () => {
      expect(bus.getClientCount("nonexistent")).toBe(0);
    });

    it("returns correct count after add and remove operations", () => {
      const c1 = makeMockClient("org-1", "user-1");
      const c2 = makeMockClient("org-1", "user-2");
      const c3 = makeMockClient("org-1", "user-3");

      bus.addClient(c1);
      bus.addClient(c2);
      bus.addClient(c3);
      expect(bus.getClientCount("org-1")).toBe(3);

      bus.removeClient(c2);
      expect(bus.getClientCount("org-1")).toBe(2);
    });
  });
});
