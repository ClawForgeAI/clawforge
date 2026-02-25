/**
 * ClawForge control plane server entry point.
 */

import { createServer } from "./server.js";

const PORT = parseInt(process.env.PORT ?? "4100", 10);
const HOST = process.env.HOST ?? "0.0.0.0";
const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://localhost:5432/clawforge";
const JWT_SECRET = process.env.JWT_SECRET ?? "clawforge-dev-secret-change-in-production";
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED !== "false";
const AUDIT_RETENTION_DAYS = parseInt(process.env.AUDIT_RETENTION_DAYS ?? "90", 10);
const AUDIT_CLEANUP_INTERVAL_HOURS = parseInt(process.env.AUDIT_CLEANUP_INTERVAL_HOURS ?? "24", 10);
const AUDIT_CLEANUP_BATCH_SIZE = parseInt(process.env.AUDIT_CLEANUP_BATCH_SIZE ?? "10000", 10);

async function main() {
  const app = await createServer({
    port: PORT,
    host: HOST,
    databaseUrl: DATABASE_URL,
    jwtSecret: JWT_SECRET,
    corsOrigin: CORS_ORIGIN?.split(",").map((s) => s.trim()),
    rateLimitEnabled: RATE_LIMIT_ENABLED,
    auditRetentionDays: AUDIT_RETENTION_DAYS,
    auditCleanupIntervalHours: AUDIT_CLEANUP_INTERVAL_HOURS,
    auditCleanupBatchSize: AUDIT_CLEANUP_BATCH_SIZE,
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`ClawForge control plane running on ${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
