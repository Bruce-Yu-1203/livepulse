FROM node:24.12.0-bookworm-slim AS workspace

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

WORKDIR /workspace

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/db/package.json packages/db/package.json

RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm --filter @livepulse/contracts build \
  && pnpm --filter @livepulse/db build \
  && pnpm --filter @livepulse/api build

ENV NODE_ENV=production

USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/main.js"]
