/**
 * In-memory SSE event broadcaster for ClawForge control plane.
 *
 * Maintains a registry of connected SSE clients keyed by orgId and broadcasts
 * events (kill_switch, policy_updated, etc.) to all clients in an organization.
 */

import type { FastifyReply } from "fastify";

export type SSEClient = {
  orgId: string;
  userId: string;
  reply: FastifyReply;
};

export class EventBus {
  /** orgId -> Set of connected clients */
  private clients = new Map<string, Set<SSEClient>>();

  /**
   * Register a connected SSE client.
   */
  addClient(client: SSEClient): void {
    let orgClients = this.clients.get(client.orgId);
    if (!orgClients) {
      orgClients = new Set();
      this.clients.set(client.orgId, orgClients);
    }
    orgClients.add(client);
  }

  /**
   * Deregister a client on disconnect.
   */
  removeClient(client: SSEClient): void {
    const orgClients = this.clients.get(client.orgId);
    if (!orgClients) return;
    orgClients.delete(client);
    if (orgClients.size === 0) {
      this.clients.delete(client.orgId);
    }
  }

  /**
   * Broadcast an SSE event to all connected clients in an organization.
   *
   * @param orgId  - The organization to broadcast to
   * @param event  - The SSE event name (e.g. "kill_switch", "policy_updated")
   * @param data   - The JSON-serializable data payload
   */
  broadcast(orgId: string, event: string, data: unknown): void {
    const orgClients = this.clients.get(orgId);
    if (!orgClients || orgClients.size === 0) return;

    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

    for (const client of orgClients) {
      try {
        client.reply.raw.write(payload);
      } catch {
        // Client likely disconnected; remove it.
        this.removeClient(client);
      }
    }
  }

  /**
   * Get the number of connected clients for an org (useful for monitoring).
   */
  getClientCount(orgId: string): number {
    return this.clients.get(orgId)?.size ?? 0;
  }
}

/** Singleton event bus instance shared across the server. */
export const eventBus = new EventBus();
