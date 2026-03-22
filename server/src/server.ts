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
import { eventRoutes } from "./routes/events.js";
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

export type HealthCheckResult = {
  status: "ok" | "error" | "skipped";
  latencyMs: number;
  error?: string;
  version?: string;
  provider?: string;
  configured?: boolean;
};

export type ReadinessResponse = {
  status: "ready" | "not_ready";
  timestamp: string;
  version: string;
  checks: {
    database: HealthCheckResult;
    migrations: HealthCheckResult;
    sso: HealthCheckResult;
  };
};

type ReadinessDependencies = {
  sql: Sql;
  version: string;
  fetchImpl?: typeof fetch;
};

function getVersion(): string {
  return process.env.npm_package_version ?? "0.1.0";
}

function getUptimeSeconds(): number {
  return Math.floor(process.uptime());
}

export async function buildReadinessResponse({ sql, version, fetchImpl = fetch }: ReadinessDependencies): Promise<ReadinessResponse> {
  const checks: ReadinessResponse["checks"] = {
    database: { status: "ok", latencyMs: 0 },
    migrations: { status: "ok", latencyMs: 0 },
    sso: { status: "skipped", latencyMs: 0, configured: false },
  };

  let ready = true;

  const databaseStart = Date.now();
  try {
    await sql`SELECT 1`;
    checks.database = {
      status: "ok",
      latencyMs: Date.now() - databaseStart,
    };
  } catch (err) {
    ready = false;
    checks.database = {
      status: "error",
      latencyMs: Date.now() - databaseStart,
      error: err instanceof Error ? err.message : "Database unreachable",
    };
  }

  const migrationsStart = Date.now();
  try {
    const rows = await sql<{ hash: string | null }[]>`
      SELECT hash
      FROM __drizzle_migrations
      ORDER BY created_at DESC
      LIMIT 1
    `;

    checks.migrations = {
      status: "ok",
      latencyMs: Date.now() - migrationsStart,
      version: rows[0]?.hash ?? "unknown",
    };
  } catch (err) {
    ready = false;
    checks.migrations = {
      status: "error",
      latencyMs: Date.now() - migrationsStart,
      error: err instanceof Error ? err.message : "Unable to verify migrations",
    };
  }

  const ssoStart = Date.now();
  try {
    const rows = await sql<{ sso_config: { issuerUrl?: string } | null }[]>`
      SELECT sso_config
      FROM organizations
      WHERE sso_config IS NOT NULL
      LIMIT 1
    `;

    const issuerUrl = rows[0]?.sso_config?.issuerUrl;
    if (!issuerUrl) {
      checks.sso = {
        status: "skipped",
        latencyMs: Date.now() - ssoStart,
        configured: false,
      };
    } else {
      const discoveryUrl = `${issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
      const response = await fetchImpl(discoveryUrl, { signal: AbortSignal.timeout(5000) });

      if (!response.ok) {
        ready = false;
        checks.sso = {
          status: "error",
          latencyMs: Date.now() - ssoStart,
          configured: true,
          provider: issuerUrl,
          error: `OIDC discovery failed with HTTP ${response.status}`,
        };
      } else {
        checks.sso = {
          status: "ok",
          latencyMs: Date.now() - ssoStart,
          configured: true,
          provider: issuerUrl,
        };
      }
    }
  } catch (err) {
    ready = false;
    checks.sso = {
      status: "error",
      latencyMs: Date.now() - ssoStart,
      configured: true,
      error: err instanceof Error ? err.message : "Unable to verify SSO provider",
    };
  }

  return {
    status: ready ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    version,
    checks,
  };
}

export async function createServer(config: ServerConfig) {
  const app = Fastify({
    logger: true,
  });

  // CORS
  await app.register(cors, {
    origin: config.corsOrigin ?? true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
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
      addHeaders: {
        "x-ratelimit-limit": true,
        "x-ratelimit-remaining": true,
        "x-ratelimit-reset": true,
        "retry-after": true,
      },
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

  // Health checks
  app.get("/health", async () => ({ status: "ok", uptime: getUptimeSeconds(), version: getVersion() }));

  const sendReadiness = async () => {
    const body = await buildReadinessResponse({ sql, version: getVersion() });
    return { statusCode: body.status === "ready" ? 200 : 503, body };
  };

  app.get("/ready", async (_request, reply) => {
    const { statusCode, body } = await sendReadiness();
    return reply.code(statusCode).send(body);
  });

  // Backward-compatible alias.
  app.get("/health/ready", async (_request, reply) => {
    const { statusCode, body } = await sendReadiness();
    return reply.code(statusCode).send(body);
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
  await app.register(eventRoutes);
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
