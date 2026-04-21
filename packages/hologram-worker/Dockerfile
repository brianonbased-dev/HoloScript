# syntax=docker/dockerfile:1
# Build from monorepo root:
#   docker build -f packages/hologram-worker/Dockerfile .
#
# Runtime expects env (see README): STUDIO_INTERNAL_URL, HOLOGRAM_WORKER_TOKEN,
# HOLOGRAM_SHARE_BASE_URL, optional HOLOGRAM_ONNX_MODEL_PATH, HOLOGRAM_CACHE_DIR.

FROM node:22-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY scripts ./scripts

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @holoscript/engine build
RUN pnpm --filter @holoscript/hologram-worker build
ENV PLAYWRIGHT_BROWSERS_PATH=/app/packages/hologram-worker/.cache/pw
RUN mkdir -p /app/packages/hologram-worker/.cache/pw \
  && cd packages/hologram-worker && npx playwright install --with-deps chromium

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libnss3 libatk1.0-0 libdrm2 libgbm1 libxcomposite1 libxdamage1 libxfixes3 \
    libxrandr2 libasound2 libglib2.0-0 \
    ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/app/packages/hologram-worker/.cache/pw

COPY --from=build /app /app

WORKDIR /app
CMD ["node", "packages/hologram-worker/dist/server.js"]
