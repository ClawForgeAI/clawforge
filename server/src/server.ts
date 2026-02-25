/**
 * Fastify HTTP server for the ClawForge control plane.
 */

import Fastify from "fastify";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import rateLimit from "@fastify/rate-limit";
import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Sql } from "postgres";
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
import { apiKeyRoutes } from "./routes/api-keys.js";
import { startAuditRetentionJob, stopAuditRetentionJob } from "./services/audit-retention.js";

// Extend Fastify instance to include db and raw sql.
declare module "fastify" {
  interface FastifyInstance {
    db: PostgresJsDatabase<typeof schema>;
    sql: Sql;
  }
}

export type ServerConfig = {
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigin?: string | string[];
  rateLimitEnabled?: boolean;
  auditRetentionDays?: number;
  auditCleanupIntervalHours?: number;
  auditCleanupBatchSize?: number;
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

  // Rate limiting (#40)
  if (config.rateLimitEnabled !== false) {
    await app.register(rateLimit, {
      global: true,
      max: 120,
      timeWindow: "1 minute",
      keyGenerator: (request) => {
        return request.authUser?.userId ?? request.ip;
      },
      addHeadersOnExceeding: { "x-ratelimit-limit": true, "x-ratelimit-remaining": true, "x-ratelimit-reset": true },
      addHeaders: { "x-ratelimit-limit": true, "x-ratelimit-remaining": true, "x-ratelimit-reset": true, "retry-after": true },
    });
  }

  // Database
  const sql = postgres(config.databaseUrl);
  const db = drizzle(sql, { schema });
  app.decorate("db", db);
  app.decorate("sql", sql);

  // Graceful shutdown
  app.addHook("onClose", async () => {
    stopAuditRetentionJob();
    await sql.end();
  });

  // Auth middleware
  await registerAuthMiddleware(app);

  // Shallow health check (liveness probe)
  app.get("/health", async () => ({ status: "ok" }));

  // Deep health check (readiness probe) (#41)
  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, { status: string; latency_ms?: number; error?: string }> = {};
    let allHealthy = true;

    // Check PostgreSQL connectivity
    const dbStart = Date.now();
    try {
      await sql`SELECT 1`;
      checks.database = { status: "healthy", latency_ms: Date.now() - dbStart };
    } catch (err) {
      allHealthy = false;
      checks.database = {
        status: "unhealthy",
        latency_ms: Date.now() - dbStart,
        error: err instanceof Error ? err.message : "Database unreachable",
      };
    }

    const response = {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      checks,
    };

    return reply.code(allHealthy ? 200 : 503).send(response);
  });

  // Routes
  await app.register(authRoutes);
  await app.register(policyRoutes);
  await app.register(skillRoutes);
  await app.register(auditRoutes);
  await app.register(heartbeatRoutes);
  await app.register(userRoutes);
  await app.register(enrollmentRoutes);
  await app.register(organizationRoutes);
  await app.register(apiKeyRoutes);

  // Start audit retention cleanup job (#39)
  if (config.auditRetentionDays && config.auditRetentionDays > 0) {
    startAuditRetentionJob(db, {
      retentionDays: config.auditRetentionDays,
      intervalHours: config.auditCleanupIntervalHours ?? 24,
      batchSize: config.auditCleanupBatchSize ?? 10000,
    });
  }

  return app;
}
