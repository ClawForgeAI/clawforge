# ClawForge Admin Console — multi-stage build
FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:4100
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4200

RUN addgroup -S clawforge && adduser -S -G clawforge clawforge

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY --from=build /app/scripts/docker-entrypoint.sh ./docker-entrypoint.sh

RUN chown -R clawforge:clawforge /app
USER clawforge

EXPOSE 4200
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
