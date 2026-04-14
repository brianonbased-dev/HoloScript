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
COPY packages/studio/ packages/studio/

# Build workspace dependencies in order (Studio imports from all of these)
# Use tsup --no-dts directly — Studio only needs JS runtime, not type declarations.
# tsc --emitDeclarationOnly often fails in Docker due to missing cross-package refs.
RUN cd packages/crdt && npx tsup --no-dts
RUN cd packages/agent-protocol && npx tsup --no-dts
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
RUN --mount=type=cache,id=s/55a18466-6702-4497-ad22-5856f4f196f3-/app/packages/studio/.next/cache,target=/app/packages/studio/.next/cache cd packages/studio && pnpm next build

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
