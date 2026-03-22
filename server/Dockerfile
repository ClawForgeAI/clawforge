# ClawForge Server — multi-stage build
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup -S clawforge && adduser -S -G clawforge clawforge

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/src/db/migrations ./src/db/migrations
COPY --from=build /app/src/db/schema.ts ./src/db/schema.ts
COPY --from=build /app/src/db/seed.ts ./src/db/seed.ts

RUN chown -R clawforge:clawforge /app
USER clawforge

EXPOSE 4100
CMD ["node", "dist/index.js"]
