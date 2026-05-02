import { describe, expect, it, vi } from "vitest";
import { buildReadinessResponse } from "./server.js";

describe("buildReadinessResponse", () => {
  it("returns ready when database, migrations, and configured SSO checks pass", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");

      if (query.includes("SELECT 1")) {
        return [{ "?column?": 1 }];
      }

      if (query.includes("FROM __drizzle_migrations")) {
        return [{ hash: "0003_skill_version" }];
      }

      if (query.includes("FROM organizations")) {
        return [{ sso_config: { issuerUrl: "https://example.okta.com" } }];
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ issuer: "https://example.okta.com" }), { status: 200 }),
    );

    const result = await buildReadinessResponse({
      sql: sql as never,
      version: "0.1.0",
      fetchImpl,
    });

    expect(result.status).toBe("ready");
    expect(result.version).toBe("0.1.0");
    expect(result.checks.database.status).toBe("ok");
    expect(result.checks.migrations).toMatchObject({ status: "ok", version: "0003_skill_version" });
    expect(result.checks.sso).toMatchObject({ status: "ok", configured: true, provider: "https://example.okta.com" });
  });

  it("returns not_ready when the database check fails", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");

      if (query.includes("SELECT 1")) {
        throw new Error("connect ECONNREFUSED");
      }

      if (query.includes("FROM __drizzle_migrations")) {
        return [{ hash: "0003_skill_version" }];
      }

      if (query.includes("FROM organizations")) {
        return [];
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const result = await buildReadinessResponse({
      sql: sql as never,
      version: "0.1.0",
      fetchImpl: vi.fn(),
    });

    expect(result.status).toBe("not_ready");
    expect(result.checks.database.status).toBe("error");
    expect(result.checks.database.error).toContain("ECONNREFUSED");
    expect(result.checks.sso).toMatchObject({ status: "skipped", configured: false });
  });

  it("returns not_ready when configured SSO discovery fails", async () => {
    const sql = vi.fn(async (strings: TemplateStringsArray) => {
      const query = strings.join(" ");

      if (query.includes("SELECT 1")) {
        return [{ "?column?": 1 }];
      }

      if (query.includes("FROM __drizzle_migrations")) {
        return [{ hash: "0003_skill_version" }];
      }

      if (query.includes("FROM organizations")) {
        return [{ sso_config: { issuerUrl: "https://example.okta.com" } }];
      }

      throw new Error(`Unexpected query: ${query}`);
    });

    const fetchImpl = vi.fn(async () => new Response("unavailable", { status: 503 }));

    const result = await buildReadinessResponse({
      sql: sql as never,
      version: "0.1.0",
      fetchImpl,
    });

    expect(result.status).toBe("not_ready");
    expect(result.checks.database.status).toBe("ok");
    expect(result.checks.migrations.status).toBe("ok");
    expect(result.checks.sso).toMatchObject({
      status: "error",
      configured: true,
      provider: "https://example.okta.com",
    });
    expect(result.checks.sso.error).toContain("HTTP 503");
  });
});
