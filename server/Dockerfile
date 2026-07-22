FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.server.json vitest.server.config.ts ./
RUN pnpm install --frozen-lockfile

COPY server ./server
RUN mkdir -p /app/media-import /app/.analysis-work \
  && chown -R node:node /app

EXPOSE 18787
USER node
CMD ["pnpm", "start:api"]
