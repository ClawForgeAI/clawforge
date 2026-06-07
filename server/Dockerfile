# ClawForge Server — multi-stage pnpm-aware build
#
# Build context: the MONOREPO ROOT (not server/). This is required so
# `workspace:*` deps in server/package.json resolve. docker-compose.yml
# sets `context: .` and `dockerfile: server/Dockerfile`.

FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.1 --activate
WORKDIR /repo

# ---------------------------------------------------------------------------
# Stage 1 — install all workspace deps (cacheable when source hasn't changed)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
# Each package.json is copied individually so pnpm install can resolve the
# workspace graph without pulling in source files (better Docker layer cache).
COPY server/package.json server/
COPY plugin/package.json plugin/
COPY admin/package.json admin/
COPY packages/agent-sdk/package.json packages/agent-sdk/
COPY packages/audit-events/package.json packages/audit-events/
COPY packages/auth/package.json packages/auth/
COPY packages/claude-code/package.json packages/claude-code/
COPY packages/client/package.json packages/client/
COPY packages/contracts/package.json packages/contracts/
COPY packages/policy-engine/package.json packages/policy-engine/
COPY packages/policy-schema/package.json packages/policy-schema/
COPY packages/tool-governance/package.json packages/tool-governance/
COPY examples/clawforge-governed/package.json examples/clawforge-governed/
# Filter to the server's transitive workspace deps (policy-schema, policy-engine,
# audit-events, contracts, auth, tool-governance). This avoids the openclaw
# plugin's native module deps (koffi, @discordjs/opus) which need CMake and are
# irrelevant to the server runtime.
RUN pnpm install --frozen-lockfile --filter "@ClawForgeAI/clawforge-server..."

# ---------------------------------------------------------------------------
# Stage 2 — build server + its workspace dependency graph
# ---------------------------------------------------------------------------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/ packages/
COPY server/ server/
# `...` selects the package's transitive workspace deps too, in topo order:
# policy-schema → policy-engine → client → contracts → server tsc compile.
RUN pnpm --filter @ClawForgeAI/clawforge-server... build

# ---------------------------------------------------------------------------
# Stage 3 — produce a self-contained deploy bundle via `pnpm deploy`
#
# Materializes workspace:* deps into node_modules and copies the server
# package files into /deploy. devDependencies are kept because the server
# container shells out to `drizzle-kit migrate` and `tsx src/db/seed.ts`
# at runtime (both devDeps under server/package.json).
# ---------------------------------------------------------------------------
FROM build AS deploy
RUN pnpm deploy --filter @ClawForgeAI/clawforge-server /deploy

# ---------------------------------------------------------------------------
# Stage 4 — minimal runtime image
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S clawforge && adduser -S -G clawforge clawforge

COPY --from=deploy /deploy ./
RUN chown -R clawforge:clawforge /app
USER clawforge

EXPOSE 4100
CMD ["node", "dist/index.js"]
