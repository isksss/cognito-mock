# syntax=docker/dockerfile:1.7
FROM node:24.18.0-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@11.11.0 --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build \
    && find .output -type f -name '*.map' -delete \
    && mkdir /runtime-data

FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:af85d11ce7ef10172855a6e3649e3e8125b1b9e3ca41849ec2918036f05cb212 AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=9999 \
    DATABASE_PATH=/data/cognito-mock.sqlite
WORKDIR /app
COPY --from=build --chown=65532:65532 /app/.output ./.output
COPY --from=build --chown=65532:65532 /runtime-data /data
USER 65532:65532
VOLUME ["/data"]
EXPOSE 9999
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 CMD ["/nodejs/bin/node", "-e", "fetch('http://127.0.0.1:9999/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD [".output/server/index.mjs"]
