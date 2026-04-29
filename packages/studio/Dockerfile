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
COPY packages/crdt/ packages/crdt/
COPY packages/crdt-spatial/ packages/crdt-spatial/
# core-types must be copied AND built before core: @holoscript/core's compiled
# chunks (dist/chunk-*.js) reference '@holoscript/core-types/ans' as an
# external import. Webpack resolves these via the workspace symlink at build
# time, so packages/core-types/dist/ans.js must exist on disk when
# `pnpm run build` runs in studio. Without this COPY + build step the studio
# build fails with: "Module not found: Can't resolve '@holoscript/core-types/ans'"
# from ../core/dist/chunk-*.js. Verified 2026-04-27 — Railway studio service
# was 500 on every /api/* route since the workspace gained the /ans subpath
# entry; the running container is a stale image, all subsequent build deploys
# regressed silently. Pattern parallels the crdt-spatial+marketplace-api
# precedents on this same file.
COPY packages/core-types/ packages/core-types/
COPY packages/core/ packages/core/
COPY packages/engine/ packages/engine/
COPY packages/framework/ packages/framework/
COPY packages/std/ packages/std/
COPY packages/ui/ packages/ui/
COPY packages/config/ packages/config/
COPY packages/absorb-service/ packages/absorb-service/
COPY packages/agent-protocol/ packages/agent-protocol/
COPY packages/r3f-renderer/ packages/r3f-renderer/
COPY packages/studio-plugin-sdk/ packages/studio-plugin-sdk/
COPY packages/connector-core/ packages/connector-core/
COPY packages/connector-appstore/ packages/connector-appstore/
COPY packages/connector-github/ packages/connector-github/
COPY packages/connector-railway/ packages/connector-railway/
COPY packages/connector-upstash/ packages/connector-upstash/
COPY packages/connector-vscode/ packages/connector-vscode/
COPY packages/plugins/ packages/plugins/
COPY packages/platform/ packages/platform/
COPY packages/mesh/ packages/mesh/
COPY packages/llm-provider/ packages/llm-provider/
# marketplace-api is referenced by studio/src/marketplace/MarketplaceRegistry.ts
# and MarketplaceSubmission.ts via relative ../../../marketplace-api/src/...
# imports (cross-package source-path import, not @workspace dep). Without
# COPYing the package source, webpack can't resolve those paths and dies
# with: "Could not resolve ../../../marketplace-api/src/core-marketplace/
# MarketplaceRegistry.js". Verified 2026-04-25 deployment 48b215cf.
# TODO follow-up: convert these to proper @holoscript/marketplace-api
# workspace imports + drop this COPY.
COPY packages/marketplace-api/ packages/marketplace-api/
COPY packages/studio/ packages/studio/

# Build workspace dependencies in order (Studio imports from all of these)
# Use tsup --no-dts directly — Studio only needs JS runtime, not type declarations.
# tsc --emitDeclarationOnly often fails in Docker due to missing cross-package refs.
RUN cd packages/crdt && npx tsup --no-dts
# crdt-spatial must build BEFORE the plugin tsc check (line further down)
# because plugins like film3d-volumetrics-plugin import @holoscript/crdt-spatial
# and `tsc --noEmit false` needs its dist/ d.ts files. Verified 2026-04-25
# deployment 48b215cf — without this build step, the plugin tsc dies with
# "Cannot find module '@holoscript/crdt-spatial' or its corresponding type
# declarations" even though the package source IS in the build context.
RUN cd packages/crdt-spatial && npx tsup --no-dts || true
RUN cd packages/agent-protocol && npx tsup --no-dts
# core-types must build before core so that ../core-types/dist/ans.js exists
# when webpack walks core's compiled chunks during studio's `pnpm run build`.
# DTS emission required (NOT --no-dts): studio's tsc step traverses imports
# from core/dist/chunk-*.js into '@holoscript/core-types/ans' and needs the
# .d.ts to resolve the type. Without dts the build fails with
# "implicitly has 'any' type — Try ... add a new declaration (.d.ts) file".
# Verified 2026-04-29 deploy e72c8439 — same root cause as the BrowserQuiltRenderer
# fix that landed earlier this session: stale Dockerfile assumption that JS-only
# builds suffice for downstream type resolution. ~20s with dts vs ~3s without.
RUN cd packages/core-types && npx tsup
RUN cd packages/core && npx tsup --no-dts && node scripts/generate-types.mjs
RUN chmod +x scripts/docker/build-engine-no-dts.sh && ./scripts/docker/build-engine-no-dts.sh
RUN cd packages/framework && npx tsup --no-dts
RUN cd packages/std && npx tsup --no-dts
RUN cd packages/config && npx tsup --no-dts || true
RUN cd packages/absorb-service && npx tsup --no-dts
RUN cd packages/platform && npx tsup --no-dts || true
RUN cd packages/mesh && npx tsup --no-dts || true
RUN cd packages/llm-provider && npx tsup --no-dts || true
RUN for plugin in packages/plugins/*/; do [ -f "$plugin/tsconfig.json" ] && (cd "$plugin" && npx tsc --noEmit false --declaration false 2>/dev/null || true); done
RUN cd packages/r3f-renderer && npx tsup --no-dts || true
RUN cd packages/studio-plugin-sdk && npx tsup --no-dts || true
RUN cd packages/ui && npx tsup --no-dts || true
RUN cd packages/connector-core && npx tsup --no-dts || true
RUN cd packages/connector-appstore && npx tsup --no-dts || true
RUN cd packages/connector-github && npx tsup --no-dts || true
RUN cd packages/connector-railway && npx tsup --no-dts || true
RUN cd packages/connector-upstash && npx tsup --no-dts || true
RUN cd packages/connector-vscode && npx tsup --no-dts || true

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
