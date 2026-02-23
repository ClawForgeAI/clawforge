/**
 * Fastify HTTP server for the ClawForge control plane.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./db/schema.js";
import { registerAuthMiddleware } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { policyRoutes } from "./routes/policies.js";
import { skillRoutes } from "./routes/skills.js";
import { auditRoutes } from "./routes/audit.js";
import { heartbeatRoutes } from "./routes/heartbeat.js";
import { userRoutes } from "./routes/users.js";
import { enrollmentRoutes } from "./routes/enrollment.js";
import { organizationRoutes } from "./routes/organizations.js";
import { eventRoutes } from "./routes/events.js";

// Extend Fastify instance to include db.
declare module "fastify" {
  interface FastifyInstance {
    db: PostgresJsDatabase<typeof schema>;
  }
}

export type ServerConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigin?: string | string[];
};

export async function createServer(config: ServerConfig) {
  const app = Fastify({
    logger: true,
  });

  // CORS
  await app.register(cors, {
    origin: config.corsOrigin ?? true,
  });

  // JWT
  await app.register(jwt, {
    secret: config.jwtSecret,
  });

  // Database
  const sql = postgres(config.databaseUrl);
  const db = drizzle(sql, { schema });
  app.decorate("db", db);

  // Graceful shutdown
  app.addHook("onClose", async () => {
    await sql.end();
  });

  // Auth middleware
  await registerAuthMiddleware(app);

  // Health check
  app.get("/health", async () => ({ status: "ok" }));

  // Routes
  await app.register(authRoutes);
  await app.register(policyRoutes);
  await app.register(skillRoutes);
  await app.register(auditRoutes);
  await app.register(heartbeatRoutes);
  await app.register(userRoutes);
  await app.register(enrollmentRoutes);
  await app.register(organizationRoutes);
  await app.register(eventRoutes);

  return app;
}
