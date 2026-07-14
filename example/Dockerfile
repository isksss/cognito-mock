# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM node:24.18.0-bookworm-slim AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
RUN groupadd --system --gid 1001 example && useradd --system --uid 1001 --gid example example
COPY --from=build --chown=example:example /app/.output ./.output
USER example
EXPOSE 3001
CMD ["node", ".output/server/index.mjs"]
