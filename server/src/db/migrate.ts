/**
 * Migration CLI wrapper for Drizzle ORM.
 *
 * Provides:
 * - `--dry-run` mode: shows pending migrations without applying them
 * - `--status`: shows current migration state
 * - `--rollback-plan`: documents rollback procedures for the latest migration
 * - Default: runs pending migrations
 *
 * Usage:
 *   tsx src/db/migrate.ts                 # apply pending migrations
 *   tsx src/db/migrate.ts --dry-run       # show pending without applying
 *   tsx src/db/migrate.ts --status        # show migration state
 *   tsx src/db/migrate.ts --rollback-plan # show rollback info for latest migration
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MigrationJournalEntry = {
  idx: number;
  version: string;
  when: number;
  tag: string;
  breakpoints: boolean;
};

export type MigrationJournal = {
  version: string;
  dialect: string;
  entries: MigrationJournalEntry[];
};

export type MigrationStatus = {
  applied: string[];
  pending: MigrationJournalEntry[];
  total: number;
  currentVersion: string | null;
};

export type DryRunResult = {
  pending: Array<{
    tag: string;
    sql: string;
    idx: number;
  }>;
  totalStatements: number;
};

export type RollbackPlan = {
  migrationTag: string;
  sql: string;
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

export function loadJournal(journalPath: string = JOURNAL_PATH): MigrationJournal {
  const raw = fs.readFileSync(journalPath, "utf-8");
  return JSON.parse(raw) as MigrationJournal;
}

export function loadMigrationSql(tag: string, migrationsDir: string = MIGRATIONS_DIR): string {
  const sqlPath = path.join(migrationsDir, `${tag}.sql`);
  if (!fs.existsSync(sqlPath)) {
    throw new Error(`Migration file not found: ${sqlPath}`);
  }
  return fs.readFileSync(sqlPath, "utf-8");
}

/**
 * Query the __drizzle_migrations table to find applied migrations.
 * Returns an array of migration hashes/tags that have been applied.
 */
export async function getAppliedMigrations(sql: {
  unsafe: (query: string) => Promise<Array<Record<string, unknown>>>;
}): Promise<string[]> {
  try {
    const rows = await sql.unsafe(`SELECT hash FROM __drizzle_migrations ORDER BY created_at ASC`);
    return rows.map((r) => String(r.hash));
  } catch {
    // Table doesn't exist yet — no migrations applied
    return [];
  }
}

/**
 * Get the current migration status: which are applied and which are pending.
 */
export async function getMigrationStatus(
  sql: { unsafe: (query: string) => Promise<Array<Record<string, unknown>>> },
  journalPath?: string,
): Promise<MigrationStatus> {
  const journal = loadJournal(journalPath);
  const applied = await getAppliedMigrations(sql);

  const appliedTags = new Set(applied);
  const pending = journal.entries.filter((entry) => !appliedTags.has(entry.tag));

  return {
    applied,
    pending,
    total: journal.entries.length,
    currentVersion: applied.length > 0 ? applied[applied.length - 1] : null,
  };
}

/**
 * Dry-run: show what migrations would be applied without running them.
 */
export async function dryRun(
  sql: { unsafe: (query: string) => Promise<Array<Record<string, unknown>>> },
  journalPath?: string,
  migrationsDir?: string,
): Promise<DryRunResult> {
  const status = await getMigrationStatus(sql, journalPath);

  const pending: DryRunResult["pending"] = [];
  let totalStatements = 0;

  for (const entry of status.pending) {
    const migrationSql = loadMigrationSql(entry.tag, migrationsDir);
    // Count statements by splitting on the Drizzle breakpoint delimiter
    const statements = migrationSql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    totalStatements += statements.length;

    pending.push({
      tag: entry.tag,
      sql: migrationSql,
      idx: entry.idx,
    });
  }

  return { pending, totalStatements };
}

/**
 * Generate a rollback plan for a specific migration.
 *
 * Drizzle ORM does not natively support rollbacks. This function generates
 * reverse SQL for common DDL operations as a best-effort guide.
 */
export function generateRollbackPlan(tag: string, migrationsDir: string = MIGRATIONS_DIR): RollbackPlan {
  const sql = loadMigrationSql(tag, migrationsDir);
  const warnings: string[] = [];
  const rollbackStatements: string[] = [];

  const statements = sql
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Process in reverse order for rollback
  for (const stmt of statements.reverse()) {
    // CREATE TABLE
    const createTableMatch = stmt.match(/CREATE TABLE\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/i);
    if (createTableMatch) {
      rollbackStatements.push(`DROP TABLE IF EXISTS "${createTableMatch[1]}" CASCADE;`);
      continue;
    }

    // ALTER TABLE ADD COLUMN
    const addColumnMatch = stmt.match(/ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/i);
    if (addColumnMatch) {
      rollbackStatements.push(`ALTER TABLE "${addColumnMatch[1]}" DROP COLUMN IF EXISTS "${addColumnMatch[2]}";`);
      continue;
    }

    // CREATE INDEX
    const createIndexMatch = stmt.match(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF NOT EXISTS\s+)?"([^"]+)"/i);
    if (createIndexMatch) {
      rollbackStatements.push(`DROP INDEX IF EXISTS "${createIndexMatch[1]}";`);
      continue;
    }

    // ALTER TABLE ADD CONSTRAINT (FK)
    const addConstraintMatch = stmt.match(/ALTER TABLE\s+"([^"]+)"\s+ADD CONSTRAINT\s+"([^"]+)"/i);
    if (addConstraintMatch) {
      rollbackStatements.push(
        `ALTER TABLE "${addConstraintMatch[1]}" DROP CONSTRAINT IF EXISTS "${addConstraintMatch[2]}";`,
      );
      continue;
    }

    // DO $$ blocks (constraint wrappers) — skip, handled above or not reversible
    if (stmt.startsWith("DO $$")) {
      const innerConstraintMatch = stmt.match(/ADD CONSTRAINT\s+"([^"]+)"/i);
      const innerTableMatch = stmt.match(/ALTER TABLE\s+"([^"]+)"/i);
      if (innerConstraintMatch && innerTableMatch) {
        rollbackStatements.push(
          `ALTER TABLE "${innerTableMatch[1]}" DROP CONSTRAINT IF EXISTS "${innerConstraintMatch[1]}";`,
        );
        continue;
      }
    }

    // Unrecognized statement
    warnings.push(`Cannot auto-generate rollback for: ${stmt.slice(0, 80)}...`);
    rollbackStatements.push(`-- MANUAL ROLLBACK REQUIRED for:\n-- ${stmt.replace(/\n/g, "\n-- ")}`);
  }

  if (warnings.length > 0) {
    warnings.unshift("WARNING: Some statements could not be automatically reversed. Manual review required.");
  }

  return {
    migrationTag: tag,
    sql: rollbackStatements.join("\n\n"),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

function formatStatus(status: MigrationStatus): string {
  const lines: string[] = [];
  lines.push("=== Migration Status ===");
  lines.push(`Total migrations: ${status.total}`);
  lines.push(`Applied: ${status.applied.length}`);
  lines.push(`Pending: ${status.pending.length}`);
  lines.push(`Current version: ${status.currentVersion ?? "(none)"}`);

  if (status.pending.length > 0) {
    lines.push("");
    lines.push("Pending migrations:");
    for (const entry of status.pending) {
      lines.push(`  [${entry.idx}] ${entry.tag}`);
    }
  }

  return lines.join("\n");
}

function formatDryRun(result: DryRunResult): string {
  const lines: string[] = [];
  lines.push("=== Dry Run — Pending Migrations ===");

  if (result.pending.length === 0) {
    lines.push("No pending migrations. Database is up to date.");
    return lines.join("\n");
  }

  lines.push(`${result.pending.length} migration(s) would be applied (${result.totalStatements} statement(s)):`);
  lines.push("");

  for (const migration of result.pending) {
    lines.push(`--- [${migration.idx}] ${migration.tag} ---`);
    lines.push(migration.sql);
    lines.push("");
  }

  return lines.join("\n");
}

function formatRollbackPlan(plan: RollbackPlan): string {
  const lines: string[] = [];
  lines.push(`=== Rollback Plan for: ${plan.migrationTag} ===`);
  lines.push("");

  if (plan.warnings.length > 0) {
    for (const warning of plan.warnings) {
      lines.push(`⚠ ${warning}`);
    }
    lines.push("");
  }

  lines.push("-- Execute the following SQL to rollback:");
  lines.push(plan.sql);
  lines.push("");
  lines.push("-- After rollback, remove the migration record:");
  lines.push(`DELETE FROM __drizzle_migrations WHERE hash = '${plan.migrationTag}';`);

  return lines.join("\n");
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  const isStatus = args.includes("--status");
  const isRollbackPlan = args.includes("--rollback-plan");

  if (isDryRun || isStatus || isRollbackPlan) {
    // These modes need a DB connection but don't run Drizzle Kit migrate
    const { default: pg } = await import("postgres");
    const databaseUrl = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/clawforge";
    const sql = pg(databaseUrl);

    try {
      if (isStatus) {
        const status = await getMigrationStatus(sql as unknown as Parameters<typeof getMigrationStatus>[0]);
        console.log(formatStatus(status));
      } else if (isDryRun) {
        const result = await dryRun(sql as unknown as Parameters<typeof dryRun>[0]);
        console.log(formatDryRun(result));
      } else if (isRollbackPlan) {
        const tag = args[args.indexOf("--rollback-plan") + 1];
        if (!tag) {
          // Default to last migration
          const journal = loadJournal();
          const lastEntry = journal.entries[journal.entries.length - 1];
          if (!lastEntry) {
            console.log("No migrations found in journal.");
            process.exit(0);
          }
          console.log(formatRollbackPlan(generateRollbackPlan(lastEntry.tag)));
        } else {
          console.log(formatRollbackPlan(generateRollbackPlan(tag)));
        }
      }
    } finally {
      await sql.end();
    }
  } else {
    // Default: delegate to drizzle-kit migrate
    const { execSync } = await import("node:child_process");
    console.log("Running drizzle-kit migrate...");
    execSync("npx drizzle-kit migrate", {
      cwd: path.join(__dirname, "..", ".."),
      stdio: "inherit",
      env: process.env,
    });
  }
}

// Only run main if this is the entry point (not imported for testing)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
}
