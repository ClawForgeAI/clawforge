/**
 * Seed script – creates a default org and superadmin user if none exist.
 *
 * Usage:
 *   SUPERADMIN_EMAIL=admin@example.com SUPERADMIN_PASSWORD=changeme tsx src/db/seed.ts
 *
 * Env vars:
 *   DATABASE_URL          – Postgres connection string
 *   SUPERADMIN_EMAIL      – Admin email (default: admin@clawforge.local)
 *   SUPERADMIN_PASSWORD   – Admin password (default: clawforge)
 *   SUPERADMIN_ORG_NAME   – Organization name (default: Default)
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import * as schema from "./schema.js";

const DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/clawforge";
const SUPERADMIN_EMAIL = process.env.SUPERADMIN_EMAIL ?? "admin@clawforge.local";
const SUPERADMIN_PASSWORD = process.env.SUPERADMIN_PASSWORD ?? "clawforge";
const ORG_NAME = process.env.SUPERADMIN_ORG_NAME ?? "Default";

async function seed() {
  const sql = postgres(DATABASE_URL);
  const db = drizzle(sql, { schema });

  try {
    const existingOrgs = await db.select().from(schema.organizations).limit(1);

    if (existingOrgs.length > 0) {
      console.log("Database already seeded (organizations exist). Skipping.");
      await sql.end();
      return;
    }

    const [org] = await db.insert(schema.organizations).values({ name: ORG_NAME }).returning();

    console.log(`Created organization: "${org.name}" (${org.id})`);

    const passwordHash = await bcrypt.hash(SUPERADMIN_PASSWORD, 12);

    const [user] = await db
      .insert(schema.users)
      .values({
        orgId: org.id,
        email: SUPERADMIN_EMAIL,
        name: "Super Admin",
        role: "admin",
        passwordHash,
        lastSeenAt: new Date(),
      })
      .returning();

    console.log(`Created superadmin: ${user.email} (${user.id})`);

    // Create a default policy for the org.
    await db.insert(schema.policies).values({
      orgId: org.id,
      version: 1,
      auditLevel: "metadata",
      killSwitch: false,
    });

    console.log("Created default policy for organization.");
    console.log("\nSeed complete. You can now log in with:");
    console.log(`  Email:    ${SUPERADMIN_EMAIL}`);
    console.log(`  Password: ${SUPERADMIN_PASSWORD}`);
  } finally {
    await sql.end();
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
