FROM registry.leultewolde.com/mereb/mereb-node-base:v0.0.4 AS base

COPY package.json pnpm-lock.yaml ./
COPY prisma prisma
COPY schema.graphql schema.graphql
COPY src src
COPY tsconfig.base.json tsconfig.base.json
COPY tsconfig.json tsconfig.json
COPY gitmodules.seed gitmodules.seed
COPY docker-entrypoint.sh docker-entrypoint.sh

RUN pnpm install --frozen-lockfile && \
    pnpm run build && \
    chmod +x docker-entrypoint.sh

CMD ["sh", "docker-entrypoint.sh"]
