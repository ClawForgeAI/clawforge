# Database Operations

Run database operations for the ClawForge server package.

## Available operations:

- **generate**: Generate a new migration from schema changes
- **migrate**: Apply pending migrations (dry-run first)
- **seed**: Seed the database with default admin user
- **studio**: Open Drizzle Studio visual browser
- **status**: Show current migration state
- **dry-run**: Preview pending migrations without applying
- **rollback-plan**: Show rollback SQL for the latest migration

## Instructions

Ask the user which operation they want to run if not specified in: $ARGUMENTS

For `generate`:

1. Check `server/src/db/schema.ts` for recent changes
2. Run `pnpm --filter @ClawForgeAI/clawforge-server db:generate`
3. Review the generated SQL in `server/src/db/migrations/`
4. Report what tables/columns were affected

For `migrate`:

1. First run dry-run to preview: `cd server && npx tsx --env-file=.env src/db/migrate.ts --dry-run`
2. Show the user what will be applied
3. Only apply if user confirms: `pnpm --filter @ClawForgeAI/clawforge-server db:migrate`

For `seed`:

1. Run `pnpm --filter @ClawForgeAI/clawforge-server db:seed`
2. Confirm seed completed (default credentials: admin@clawforge.local / clawforge)

For `studio`:

1. Run `pnpm --filter @ClawForgeAI/clawforge-server db:studio`

For `status`:

1. Run `cd server && npx tsx --env-file=.env src/db/migrate.ts --status`

For `dry-run`:

1. Run `cd server && npx tsx --env-file=.env src/db/migrate.ts --dry-run`

For `rollback-plan`:

1. Run `cd server && npx tsx --env-file=.env src/db/migrate.ts --rollback-plan`
2. Review the generated rollback SQL and any warnings about manual steps
