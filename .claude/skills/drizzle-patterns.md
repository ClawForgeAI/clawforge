# ClawForge Drizzle ORM Patterns

## Applies to

Files in `server/src/db/`

## Schema conventions (server/src/db/schema.ts)

- All tables use `pgTable()` from `drizzle-orm/pg-core`
- Primary keys: `uuid("id").primaryKey().defaultRandom()`
- Timestamps: `timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`
- Org-scoped tables always have `orgId` referencing `organizations.id` with `onDelete: "cascade"`
- Enums use `text("column", { enum: ["value1", "value2"] })` — NOT `pgEnum`
- Typed JSONB: `jsonb("column").$type<{ key: string; nested: boolean }>()`
- Indexes are defined in the third argument of `pgTable` as an array of functions:
  ```typescript
  (table) => [index("idx_name").on(table.orgId), uniqueIndex("uniq_name").on(table.orgId, table.key)];
  ```

## Migration workflow

1. Edit `server/src/db/schema.ts`
2. Generate: `pnpm --filter @ClawForgeAI/clawforge-server db:generate`
3. Review SQL in `server/src/db/migrations/`
4. Apply: `pnpm --filter @ClawForgeAI/clawforge-server db:migrate`
5. Check status: `cd server && npx tsx --env-file=.env src/db/migrate.ts --status`

## Migration CLI (server/src/db/migrate.ts)

Supports these flags:

- `--dry-run` — show pending migrations without applying
- `--status` — show current migration state (applied vs pending)
- `--rollback-plan` — generate reverse SQL for the latest migration (best-effort)
- No flag — delegates to `drizzle-kit migrate`

## Drizzle config

Located at `server/drizzle.config.ts`. Migrations output to `server/src/db/migrations/`.

## Database access in routes/services

- Access Drizzle instance via `app.db` (decorated on Fastify instance)
- Access raw postgres.js client via `app.sql`
- Import schema: `import * as schema from "../db/schema.js"`
- Query builder: `app.db.select().from(schema.tableName).where(eq(schema.tableName.column, value))`
- Insert: `app.db.insert(schema.tableName).values({...}).returning()`
- Update: `app.db.update(schema.tableName).set({...}).where(...).returning()`
- Delete: `app.db.delete(schema.tableName).where(...)`

## Current tables (13)

organizations, users, policies, policyAssignments, skillSubmissions, approvedSkills, auditEvents, clientHeartbeats, enrollmentTokens, apiKeys, webhooks, webhookDeliveries, alertRules
