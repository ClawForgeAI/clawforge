/**
 * Tests for the migration CLI wrapper.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import {
  loadJournal,
  loadMigrationSql,
  getAppliedMigrations,
  getMigrationStatus,
  dryRun,
  generateRollbackPlan,
} from "./migrate.js";

// ---------------------------------------------------------------------------
// Helpers — use the real migrations directory for integration-style tests
// ---------------------------------------------------------------------------

const MIGRATIONS_DIR = path.join(import.meta.dirname, "migrations");
const JOURNAL_PATH = path.join(MIGRATIONS_DIR, "meta", "_journal.json");

describe("loadJournal", () => {
  it("loads and parses the migration journal", () => {
    const journal = loadJournal(JOURNAL_PATH);

    expect(journal.version).toBe("7");
    expect(journal.dialect).toBe("postgresql");
    expect(Array.isArray(journal.entries)).toBe(true);
    expect(journal.entries.length).toBeGreaterThan(0);
    expect(journal.entries[0]).toHaveProperty("tag");
    expect(journal.entries[0]).toHaveProperty("idx");
    expect(journal.entries[0]).toHaveProperty("when");
  });

  it("throws for nonexistent journal path", () => {
    expect(() => loadJournal("/nonexistent/path/_journal.json")).toThrow();
  });
});

describe("loadMigrationSql", () => {
  it("loads SQL for a known migration tag", () => {
    const journal = loadJournal(JOURNAL_PATH);
    const firstTag = journal.entries[0].tag;
    const sql = loadMigrationSql(firstTag, MIGRATIONS_DIR);

    expect(typeof sql).toBe("string");
    expect(sql.length).toBeGreaterThan(0);
  });

  it("throws for unknown migration tag", () => {
    expect(() => loadMigrationSql("nonexistent_migration_tag", MIGRATIONS_DIR)).toThrow(
      /Migration file not found/,
    );
  });
});

describe("getAppliedMigrations", () => {
  it("returns applied migration hashes from the database", async () => {
    const mockSql = {
      unsafe: vi.fn().mockResolvedValue([
        { hash: "0000_dry_magus" },
        { hash: "0001_slimy_lizard" },
      ]),
    };

    const applied = await getAppliedMigrations(mockSql);

    expect(applied).toEqual(["0000_dry_magus", "0001_slimy_lizard"]);
    expect(mockSql.unsafe).toHaveBeenCalledWith(
      "SELECT hash FROM __drizzle_migrations ORDER BY created_at ASC",
    );
  });

  it("returns empty array if migrations table does not exist", async () => {
    const mockSql = {
      unsafe: vi.fn().mockRejectedValue(new Error("relation __drizzle_migrations does not exist")),
    };

    const applied = await getAppliedMigrations(mockSql);

    expect(applied).toEqual([]);
  });
});

describe("getMigrationStatus", () => {
  it("correctly identifies pending migrations", async () => {
    const journal = loadJournal(JOURNAL_PATH);
    // Pretend the first 3 are applied
    const appliedTags = journal.entries.slice(0, 3).map((e) => e.tag);
    const mockSql = {
      unsafe: vi.fn().mockResolvedValue(appliedTags.map((hash) => ({ hash }))),
    };

    const status = await getMigrationStatus(mockSql, JOURNAL_PATH);

    expect(status.applied).toEqual(appliedTags);
    expect(status.pending.length).toBe(journal.entries.length - 3);
    expect(status.total).toBe(journal.entries.length);
    expect(status.currentVersion).toBe(appliedTags[appliedTags.length - 1]);
  });

  it("shows all migrations as pending when none are applied", async () => {
    const journal = loadJournal(JOURNAL_PATH);
    const mockSql = {
      unsafe: vi.fn().mockRejectedValue(new Error("no table")),
    };

    const status = await getMigrationStatus(mockSql, JOURNAL_PATH);

    expect(status.applied).toEqual([]);
    expect(status.pending.length).toBe(journal.entries.length);
    expect(status.currentVersion).toBeNull();
  });
});

describe("dryRun", () => {
  it("shows pending migration SQL without applying", async () => {
    const journal = loadJournal(JOURNAL_PATH);
    // Pretend nothing is applied
    const mockSql = {
      unsafe: vi.fn().mockRejectedValue(new Error("no table")),
    };

    const result = await dryRun(mockSql, JOURNAL_PATH, MIGRATIONS_DIR);

    expect(result.pending.length).toBe(journal.entries.length);
    expect(result.totalStatements).toBeGreaterThan(0);

    // Each pending migration should have SQL content
    for (const migration of result.pending) {
      expect(migration.tag).toBeTruthy();
      expect(migration.sql.length).toBeGreaterThan(0);
    }
  });

  it("returns empty pending when all migrations are applied", async () => {
    const journal = loadJournal(JOURNAL_PATH);
    const allTags = journal.entries.map((e) => e.tag);
    const mockSql = {
      unsafe: vi.fn().mockResolvedValue(allTags.map((hash) => ({ hash }))),
    };

    const result = await dryRun(mockSql, JOURNAL_PATH, MIGRATIONS_DIR);

    expect(result.pending).toEqual([]);
    expect(result.totalStatements).toBe(0);
  });
});

describe("generateRollbackPlan", () => {
  it("generates reverse SQL for CREATE TABLE statements", () => {
    const plan = generateRollbackPlan("0005_alert_and_rbac_tables", MIGRATIONS_DIR);

    expect(plan.migrationTag).toBe("0005_alert_and_rbac_tables");
    expect(plan.sql).toContain("DROP TABLE");
    expect(plan.sql).toContain("DROP INDEX");
    expect(plan.sql).toContain("DROP CONSTRAINT");
  });

  it("generates reverse SQL for ALTER TABLE ADD COLUMN", () => {
    // 0006 adds a column
    const plan = generateRollbackPlan("0006_flashy_wendell_rand", MIGRATIONS_DIR);

    expect(plan.migrationTag).toBe("0006_flashy_wendell_rand");
    expect(plan.sql).toContain("DROP COLUMN");
  });

  it("throws for nonexistent migration tag", () => {
    expect(() => generateRollbackPlan("nonexistent_tag", MIGRATIONS_DIR)).toThrow(
      /Migration file not found/,
    );
  });
});
