FROM node:24.12.0-bookworm-slim AS workspace

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json

RUN pnpm install --frozen-lockfile

COPY . .

FROM workspace AS api-build

RUN pnpm --filter @livepulse/contracts build \
  && pnpm --filter @livepulse/db build \
  && pnpm --filter @livepulse/api build

FROM workspace AS web-build

ARG API_ORIGIN=http://api:3001
ARG NEXT_PUBLIC_SOCKET_IO_URL=http://localhost:3001
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY=
ENV API_ORIGIN=$API_ORIGIN
ENV NEXT_PUBLIC_SOCKET_IO_URL=$NEXT_PUBLIC_SOCKET_IO_URL
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY

RUN pnpm --filter @livepulse/contracts build \
  && pnpm --filter @livepulse/web build

FROM node:24.12.0-bookworm-slim AS api

WORKDIR /workspace
COPY --from=api-build --chown=node:node /workspace /workspace

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]

FROM node:24.12.0-bookworm-slim AS web

ENV NODE_ENV=production
WORKDIR /workspace/apps/web
COPY --from=web-build --chown=node:node /workspace /workspace

USER node
EXPOSE 3000
CMD ["./node_modules/.bin/next", "start", "-p", "3000"]
