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
import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from "prom-client";
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

// ---------------------------------------------------------------------------
// Metrics types
// ---------------------------------------------------------------------------

export type AppMetrics = {
  heartbeatCounter: Counter;
  auditEventsCounter: Counter;
  activeInstancesGauge: Gauge;
  policyFetchCounter: Counter;
  killSwitchGauge: Gauge;
};

// Extend Fastify instance to include db, raw sql, and metrics.
declare module "fastify" {
  interface FastifyInstance {
    db: PostgresJsDatabase<typeof schema>;
    sql: Sql;
    metrics: AppMetrics;
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
  logLevel?: string;
  logFormat?: string; // 'json' or 'pretty'
};

export async function createServer(config: ServerConfig) {
  const startTime = Date.now();

  const app = Fastify({
    logger: {
      level: config.logLevel ?? "info",
      formatters: {
        level(label) {
          return { level: label };
        },
      },
    },
  });

  // ---------------------------------------------------------------------------
  // Prometheus metrics (#76)
  // ---------------------------------------------------------------------------

  const metricsRegistry = new Registry();
  collectDefaultMetrics({ register: metricsRegistry });

  const httpRequestDuration = new Histogram({
    name: "clawforge_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    registers: [metricsRegistry],
  });

  const heartbeatCounter = new Counter({
    name: "clawforge_heartbeats_total",
    help: "Total heartbeat pings received",
    registers: [metricsRegistry],
  });

  const auditEventsCounter = new Counter({
    name: "clawforge_audit_events_ingested_total",
    help: "Total audit events ingested",
    registers: [metricsRegistry],
  });

  const activeInstancesGauge = new Gauge({
    name: "clawforge_active_instances",
    help: "Number of active plugin instances (online clients)",
    registers: [metricsRegistry],
  });

  const policyFetchCounter = new Counter({
    name: "clawforge_policy_fetches_total",
    help: "Total policy fetches",
    registers: [metricsRegistry],
  });

  const killSwitchGauge = new Gauge({
    name: "clawforge_kill_switch_active",
    help: "Whether the kill switch is currently active (1=active, 0=inactive)",
    registers: [metricsRegistry],
  });

  app.decorate("metrics", {
    heartbeatCounter,
    auditEventsCounter,
    activeInstancesGauge,
    policyFetchCounter,
    killSwitchGauge,
  });

  // Track HTTP request duration on every response
  app.addHook("onResponse", (request, reply, done) => {
    const routeUrl = request.routeOptions?.url ?? request.url;
    httpRequestDuration.observe(
      { method: request.method, route: routeUrl, status_code: reply.statusCode },
      reply.elapsedTime / 1000,
    );
    done();
  });

  // GET /metrics - Prometheus scrape endpoint
  app.get("/metrics", async (_request, reply) => {
    const metrics = await metricsRegistry.metrics();
    return reply.type(metricsRegistry.contentType).send(metrics);
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
        return `${request.authUser?.orgId ?? "anon"}:${request.authUser?.userId ?? request.ip}`;
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
  app.get("/health", async () => ({
    status: "ok",
    uptime: Math.floor((Date.now() - startTime) / 1000),
    version: process.env.npm_package_version ?? "0.1.0",
  }));

  // Deep health check (readiness probe) (#41, #73)
  const getReadyHealth = async () => {
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

    // Check migration status
    const migrationStart = Date.now();
    try {
      const result = await sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'organizations')`;
      const migrated = result[0]?.exists === true;
      checks.migrations = {
        status: migrated ? "healthy" : "unhealthy",
        latency_ms: Date.now() - migrationStart,
        ...(migrated ? {} : { error: "Schema not migrated" }),
      };
      if (!migrated) allHealthy = false;
    } catch (err) {
      allHealthy = false;
      checks.migrations = {
        status: "unhealthy",
        latency_ms: Date.now() - migrationStart,
        error: err instanceof Error ? err.message : "Migration check failed",
      };
    }

    // Check SSO provider reachability (if configured)
    try {
      const orgs = await db.select({ ssoConfig: schema.organizations.ssoConfig }).from(schema.organizations);
      const ssoOrg = orgs.find((o) => o.ssoConfig?.issuerUrl);
      if (ssoOrg?.ssoConfig) {
        const ssoStart = Date.now();
        try {
          const discoveryUrl = `${ssoOrg.ssoConfig.issuerUrl.replace(/\/$/, "")}/.well-known/openid-configuration`;
          const resp = await fetch(discoveryUrl, { signal: AbortSignal.timeout(5000) });
          checks.sso = {
            status: resp.ok ? "healthy" : "unhealthy",
            latency_ms: Date.now() - ssoStart,
            ...(resp.ok ? {} : { error: `HTTP ${resp.status}` }),
          };
          if (!resp.ok) allHealthy = false;
        } catch (err) {
          checks.sso = {
            status: "unhealthy",
            latency_ms: Date.now() - ssoStart,
            error: err instanceof Error ? err.message : "SSO provider unreachable",
          };
          // SSO being unreachable should not make the whole server unhealthy
          // just report it as degraded
        }
      }
    } catch {
      // If we can't query orgs (e.g. DB issue), skip SSO check
    }

    const body = {
      status: allHealthy ? "healthy" : "unhealthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      uptime: Math.floor((Date.now() - startTime) / 1000),
      checks,
    };

    return { statusCode: allHealthy ? 200 : 503, body };
  };

  app.get("/health/ready", async (_request, reply) => {
    const { statusCode, body } = await getReadyHealth();
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
