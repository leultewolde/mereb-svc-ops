FROM registry.leultewolde.com/mereb/mereb-node-base:v0.0.4 AS base

COPY package.json pnpm-lock.yaml ./
COPY prisma prisma
COPY schema.graphql schema.graphql
COPY src src
COPY tsconfig.base.json tsconfig.base.json
COPY tsconfig.json tsconfig.json
COPY gitmodules.seed gitmodules.seed

RUN pnpm install --frozen-lockfile && \
    pnpm run build

CMD ["node", "dist/index.js"]
