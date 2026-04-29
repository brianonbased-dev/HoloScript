ARG PNPM_VERSION=8.12.0
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat dumb-init chromium
RUN if [ -x /usr/bin/chromium-browser ] && [ ! -e /usr/bin/chromium ]; then ln -s /usr/bin/chromium-browser /usr/bin/chromium; fi
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# ─── Collect all package.json for lockfile resolution ────────────────────────
# pnpm install --frozen-lockfile needs every workspace package.json present.
# We copy the full repo into a temp stage, then extract only package.json files.
FROM base AS manifests
WORKDIR /app
COPY . .
RUN mkdir -p /manifests && \
    find packages services benchmarks -type f -name "package.json" 2>/dev/null | grep -v "node_modules" | while read -r f; do \
        mkdir -p "/manifests/$(dirname "$f")" && cp "$f" "/manifests/$f"; \
    done

# ─── Install all deps ────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --from=manifests /manifests/ ./
COPY scripts/docker/build-engine-no-dts.sh scripts/docker/build-engine-no-dts.sh

RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/ ./
# Copy ALL workspace packages in one shot. Was 27 individual COPY lines that
# silently missed transitively-imported packages (snn-webgpu, marketplace-agentkit,
# uaal, holomap, etc.) causing a whack-a-mole of "Cannot find module
# '@holoscript/<name>'" deploy failures. Studio's tsconfig has
# `"@holoscript/engine": ["../engine/src"]` so tsc walks engine SOURCE, which
# transitively imports ~15 workspace packages — every one needs to be on disk.
# .dockerignore excludes node_modules, dist, .git, demos, samples, etc., so
# this pulls only source + package.json files (~30MB).
COPY packages/ packages/

# Build workspace dependencies in topological order with DTS emitted.
# Why dts everywhere: studio's tsconfig has `"@holoscript/engine": ["../engine/src"]`
# so studio's tsc step walks engine SOURCE, which transitively imports types from
# ~15 workspace packages. Without dts on disk, tsc reports "Could not find a
# declaration file for module '@holoscript/<name>'" — the whack-a-mole pattern
# we hit 7 times this session (BrowserQuiltRenderer, core-types/ans, jsonwebtoken,
# marketplace-agentkit, transformers, three, crdt-spatial, snn-webgpu).
# Engine itself stays --no-dts (build-engine-no-dts.sh) — its tsup OOMs on the
# full graph; engine src is walked directly via tsconfig path alias instead.
# core stays --no-dts because it has hand-crafted index.d.ts via generate-types.mjs.
# `|| true` tolerates packages whose dts emission has known issues and lets the
# build continue; tsc later reports the specific gap if a needed type is missing.
RUN cd packages/crdt && npx tsup || true
RUN cd packages/crdt-spatial && npx tsup || true
RUN cd packages/snn-webgpu && npx tsup || true
RUN cd packages/uaal && npx tsup || true
RUN cd packages/agent-protocol && npx tsup || true
RUN cd packages/core-types && npx tsup
RUN cd packages/core && npx tsup --no-dts && node scripts/generate-types.mjs
RUN chmod +x scripts/docker/build-engine-no-dts.sh && ./scripts/docker/build-engine-no-dts.sh
RUN cd packages/framework && npx tsup || true
RUN cd packages/std && npx tsup || true
RUN cd packages/config && npx tsup || true
RUN cd packages/absorb-service && npx tsup || true
RUN cd packages/platform && npx tsup || true
RUN cd packages/mesh && npx tsup || true
RUN cd packages/llm-provider && npx tsup || true
RUN cd packages/marketplace-agentkit && npx tsup || true
RUN cd packages/security-sandbox && npx tsup || true
RUN for plugin in packages/plugins/*/; do [ -f "$plugin/tsconfig.json" ] && (cd "$plugin" && npx tsc --noEmit false --declaration false 2>/dev/null || true); done
RUN cd packages/r3f-renderer && npx tsup || true
RUN cd packages/studio-plugin-sdk && npx tsup || true
RUN cd packages/ui && npx tsup || true
RUN cd packages/connector-core && npx tsup || true
RUN cd packages/connector-appstore && npx tsup || true
RUN cd packages/connector-github && npx tsup || true
RUN cd packages/connector-railway && npx tsup || true
RUN cd packages/connector-upstash && npx tsup || true
RUN cd packages/connector-vscode && npx tsup || true

# Ensure webpack stubs exist (Docker cache can miss them)
RUN test -f packages/studio/src/lib/empty-module.js || \
    (mkdir -p packages/studio/src/lib && echo "module.exports = function(){};" > packages/studio/src/lib/empty-module.js)

# Build Studio — standalone output is enabled on Linux
ENV NEXT_TELEMETRY_DISABLED=1
ENV SHARP_IGNORE_GLOBAL_LIBVIPS=1
# Use `pnpm run build` (not `pnpm next build`) so the `--webpack` flag from
# package.json's "build" script is applied. Without it, Next.js 16 defaults
# to Turbopack which can't read the webpack-config in next.config.js, and
# the build dies with: "ERROR: This build is using Turbopack, with a
# `webpack` config and no `turbopack` config. ... Build error occurred ...
# Error: Call retries were exceeded ... type: 'WorkerError'". Verified
# 2026-04-25 against Railway deployment b69f2efe (5 consecutive failures).
RUN --mount=type=cache,id=s/55a18466-6702-4497-ad22-5856f4f196f3-/app/packages/studio/.next/cache,target=/app/packages/studio/.next/cache cd packages/studio && pnpm run build

# ─── Production runner ───────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Ensure NextJS standalone server binds to 0.0.0.0
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/packages/studio/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/packages/studio/.next/static ./packages/studio/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/packages/studio/public ./packages/studio/public

USER nextjs
EXPOSE 3000

CMD ["dumb-init", "node", "packages/studio/server.js"]
