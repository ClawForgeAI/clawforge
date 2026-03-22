# ClawForge — Agent Guidelines

## Project Overview

ClawForge is an enterprise governance and control plane for OpenClaw. Monorepo with three packages:

- **`plugin/`** — OpenClaw plugin (`@clawforgeai/clawforge`): SSO auth, tool policy enforcement, skill approval, audit logging, kill switch. Published to npm via changesets.
- **`server/`** — Fastify API (`@ClawForgeAI/clawforge-server`): Drizzle ORM + PostgreSQL, JWT auth, rate limiting, audit retention. Port **4100**.
- **`admin/`** — Next.js 15 dashboard (`@ClawForgeAI/clawforge-admin`): React 19, Tailwind, DaisyUI. Port **4200**.

Repository: https://github.com/ClawForgeAI/clawforge

## Project Structure

```
clawforge/
├── plugin/          # OpenClaw plugin (tsup build, published to npm)
│   ├── src/         # Plugin source
│   ├── bin/         # CLI entry (clawforge.mjs)
│   └── openclaw.plugin.json
├── server/          # Fastify backend
│   ├── src/
│   │   ├── db/      # Drizzle schema, migrations, seed
│   │   └── ...      # Routes, middleware, services
│   └── Dockerfile
├── admin/           # Next.js admin console
│   ├── src/
│   │   ├── test/    # Test setup (MSW, jsdom)
│   │   └── ...      # Pages, components, hooks
│   └── Dockerfile
├── .changeset/      # Changesets config (only plugin is published)
├── .github/         # CI, templates, dependabot
├── docs/            # Documentation
└── docker-compose.yml
```

## Build, Test, and Dev Commands

Runtime: **Node 22+**, **pnpm 9+**.

```sh
# Install
pnpm install

# Dev servers
pnpm dev:server          # Fastify on :4100 (tsx watch, reads .env)
pnpm dev:admin           # Next.js on :4200

# Build
pnpm --filter @clawforgeai/clawforge build          # Plugin (tsup)
pnpm --filter @ClawForgeAI/clawforge-server build   # Server (tsc)
pnpm --filter @ClawForgeAI/clawforge-admin build    # Admin (next build)

# Test
pnpm test                                            # Plugin tests
pnpm --filter @ClawForgeAI/clawforge-server test     # Server tests
pnpm --filter @ClawForgeAI/clawforge-admin test      # Admin tests

# Lint & format
pnpm lint                # ESLint (all packages)
pnpm lint:fix            # ESLint autofix
pnpm format:check        # Prettier check
pnpm format              # Prettier write

# Release (changesets — plugin only)
pnpm changeset           # Create changeset
pnpm version-packages    # Apply version bumps
pnpm release             # Publish to npm
```

## Database (Server)

PostgreSQL 17 via Drizzle ORM. Schema at `server/src/db/schema.ts`, migrations at `server/src/db/migrations/`.

```sh
# Run from server/ or use --filter
pnpm --filter @ClawForgeAI/clawforge-server db:generate   # Generate migration from schema
pnpm --filter @ClawForgeAI/clawforge-server db:migrate    # Apply migrations
pnpm --filter @ClawForgeAI/clawforge-server db:seed       # Seed default admin user
pnpm --filter @ClawForgeAI/clawforge-server db:studio     # Drizzle Studio (visual DB browser)
```

Default seed credentials: `admin@clawforge.local` / `clawforge`.

## Coding Style

- **TypeScript ESM**, strict mode in all packages.
- **Prettier**: double quotes, semicolons, trailing commas, 120 print width, 2-space indent.
- **ESLint** (flat config, v10):
  - `@typescript-eslint/no-explicit-any`: warn
  - `@typescript-eslint/no-unused-vars`: warn (underscore-prefixed args OK)
  - `no-console`: warn (`console.warn` and `console.error` allowed)
- Avoid `any`; fix root causes instead of suppressing.
- Keep files concise. Add brief comments for non-obvious logic.

## Testing Guidelines

- **Framework**: Vitest with V8 coverage.
- **Plugin tests**: `plugin/src/**/*.test.ts` — unit tests, node environment.
- **Server tests**: `server/src/**/*.test.ts` — node environment, mock DB helpers. CI runs against real PostgreSQL 17.
- **Admin tests**: `admin/src/**/*.test.{ts,tsx}` — jsdom environment, MSW for API mocking, Testing Library + jest-dom. Setup file: `admin/src/test/setup.ts`.
- Run `pnpm test` (or per-package) before pushing when you touch logic.

## CI Gates

All checks run on push to `main` and on PRs:

1. **lint-and-format** — `pnpm lint` + `pnpm format:check`
2. **typecheck** — server `build` + admin `build`
3. **test-server** — with PostgreSQL 17 service, coverage
4. **test-plugin** — coverage
5. **build-docker** — builds images, starts stack, health-checks `GET /health/ready`

## Commit & PR Conventions

- Use [Conventional Commits](https://www.conventionalcommits.org/) prefixes: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Group related changes; avoid bundling unrelated refactors.
- **Changesets**: create a changeset (`pnpm changeset`) for user-facing plugin changes. Server and admin are excluded from npm publishing.
- PR template: `.github/pull_request_template.md` — fill out What/Why/How to test/Checklist.
- Bug-fix PRs require: symptom evidence, verified root cause, fix touches implicated path, regression test when feasible.

## Multi-Agent Safety

- Do **not** create/apply/drop `git stash` entries unless explicitly requested.
- Do **not** create/modify/remove `git worktree` checkouts unless explicitly requested.
- Do **not** switch branches unless explicitly requested.
- Scope commits to your changes only. When told "commit all", commit everything in grouped chunks.
- When you see unrecognized files, keep going; focus on your changes.

## Docker & Deployment

```sh
docker compose up --build    # Full stack: postgres + server + admin
```

**Services:**
| Service | Image | Port | Health check |
|----------|----------------|------|-------------------------------------------|
| postgres | postgres:17 | 5432 | pg_isready |
| server | ./server | 4100 | `GET /health/ready` |
| admin | ./admin | 4200 | — |

Server container runs migrations and seed automatically before starting.

## Environment Variables

Copy `.env.example` to `.env` at root; server also reads its own `.env`.

Key variables:

- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET` — JWT signing secret (**change in production**)
- `CORS_ORIGIN` — allowed origin (default `http://localhost:4200`)
- `PORT` / `HOST` — server bind (default `4100` / `0.0.0.0`)
- `RATE_LIMIT_ENABLED` — toggle rate limiting
- `AUDIT_RETENTION_DAYS` — audit log retention (default 90)
- `NEXT_PUBLIC_API_URL` — admin → server URL (build-time)

**Never commit `.env` files or real secrets.** Use `.env.example` as the template.

## Security

- Report vulnerabilities via [GitHub Private Vulnerability Reporting](https://github.com/ClawForgeAI/clawforge/security/advisories/new).
- See `SECURITY.md` for the full policy, response timeline, and credit process.
- Never commit real credentials, phone numbers, or PII. Use fake placeholders in tests and docs.

## Pre-Commit Hooks

Configured via `.pre-commit-config.yaml`:

- Trailing whitespace, EOF fixer, YAML/JSON checks, merge conflict detection
- Large file check (500 KB max)
- Secret detection (detect-secrets)
- ESLint + Prettier checks
