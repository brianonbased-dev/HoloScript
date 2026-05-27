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

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json tsconfig.json ./
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
# JS compilation must succeed (fail loudly); only dts emission is tolerated as
# optional — tsc later reports the specific gap if a needed type is missing.
# Pattern: `npx tsup --no-dts` fails the build on JS errors; `npx tsup --dts-only || true`
# attempts declaration emit and silently ignores dts-only failures (tsup 8+ flag).
RUN cd packages/crdt && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/crdt-spatial && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/snn-webgpu && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/uaal && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/agent-protocol && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/core-types && npx tsup
RUN cd packages/core && npx tsup --no-dts && node scripts/generate-types.mjs
RUN chmod +x scripts/docker/build-engine-no-dts.sh && ./scripts/docker/build-engine-no-dts.sh
# llm-provider MUST build before framework: framework/src/ai/adapters.ts and
# framework/src/llm/llm-adapter.ts import '@holoscript/llm-provider' (workspace
# dep), so framework's `tsc -p tsconfig.build.json` step below needs
# llm-provider's dist/*.d.ts on disk or it fails with TS2307 "Cannot find module
# '@holoscript/llm-provider'" (broke 3 consecutive Studio deploys 2026-05-26).
# llm-provider has no workspace deps, so it can build right after engine.
RUN cd packages/llm-provider && npx tsup --no-dts && (npx tsup --dts-only || true)
# Framework needs BOTH the tsup JS build AND a tsc declaration emit because
# tsup.config.ts has dts: false (subpath dts via tsup is unreliable for this
# package). Without the tsc step, dist/agents/index.d.ts etc. don't exist, and
# Studio's `next build` type-check fails on `@holoscript/framework/agents`
# with TS7016. The custom scripts/build-framework.mjs would do this in 4
# memory-tuned batches, but requests up to 6GB heap which OOMs in Railway's
# build container. The single-pass tsup proved fine in the prior Dockerfile,
# so we keep it + add the missing tsc declaration step.
#
# The JS build (`tsup --no-dts`) MUST succeed and fails loudly. The tsc step is
# DECLARATION-EMIT ONLY and is tolerated as optional (`|| true`) — identical to
# the dts-only philosophy used for every other package above (lines 56-59).
# Why tolerate: framework imports `@holoscript/core/traits`, whose generated
# declaration (`core/dist/traits/index.d.ts`) re-exports the namespaced domain
# plugins (`export * as RadioAstronomyPlugin from '@holoscript/radio-astronomy-plugin'`
# …). Those plugins' `types` point at SOURCE (`src/index.ts`), so tsc walks ~189
# plugin source files — including `.tsx` that import `react` / `three` /
# `@react-three/fiber`, type deps NOT installed in this slim build's resolution
# scope → TS2307. This is a cross-package SOURCE error in a transitively-walked
# plugin, not a framework defect: `noEmitOnError` is unset, so framework's own
# `dist/*.d.ts` still emit before tsc returns non-zero. Tolerating the exit code
# lets Studio deploy while framework's declarations land correctly. (The deeper
# fix — core not statically re-exporting domain-plugin source — is tracked
# separately; see handoff. This unblocks the Console Front deploy now.)
RUN cd packages/framework && npx tsup --no-dts && (npx tsc -p tsconfig.build.json || true)
RUN cd packages/std && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/config && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/absorb-service && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/platform && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/mesh && npx tsup --no-dts && (npx tsup --dts-only || true)
# (llm-provider moved earlier — see note above, must build before framework)
RUN cd packages/marketplace-agentkit && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/security-sandbox && npx tsup --no-dts && (npx tsup --dts-only || true)
# secrets-broker: studio/src/lib/capability-session.ts imports
# '@holoscript/secrets-broker' (used by api/connectors/disconnect/route.ts), a
# workspace:* dep. Without its dist on disk, Studio's `next build` (step 32)
# fails with "Module not found: Can't resolve '@holoscript/secrets-broker'".
# Zero workspace deps, so it builds standalone here among the leaf packages.
RUN cd packages/secrets-broker && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN for plugin in packages/plugins/*/; do [ -f "$plugin/tsconfig.json" ] && (cd "$plugin" && npx tsc --noEmit false --declaration false 2>/dev/null || true); done
RUN cd packages/r3f-renderer && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/studio-plugin-sdk && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/ui && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/connector-core && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/connector-appstore && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/connector-github && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/connector-railway && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/connector-upstash && npx tsup --no-dts && (npx tsup --dts-only || true)
RUN cd packages/connector-vscode && npx tsup --no-dts && (npx tsup --dts-only || true)

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
RUN --mount=type=cache,id=s/55a18466-6702-4497-ad22-5856f4f196f3-/app/packages/studio/.next/cache-v2,target=/app/packages/studio/.next/cache cd packages/studio && pnpm run build

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

# Migrations + runner — copied alongside the standalone output so the runtime
# can self-heal schema on cold start. The pre-CMD step runs
# scripts/db-migrate.cjs, which is idempotent against drizzle's
# __drizzle_migrations ledger so reruns are no-ops. Without this step the
# Studio container boots against whatever schema state Postgres happens to
# be in — which already bit us once on 2026-04-29 (the 35-table push had to
# be applied by hand from a workstation against the prod proxy).
COPY --from=builder --chown=nextjs:nodejs /app/packages/studio/drizzle ./packages/studio/drizzle
COPY --from=builder --chown=nextjs:nodejs /app/packages/studio/scripts/db-migrate.cjs ./packages/studio/scripts/db-migrate.cjs

# Next.js standalone output traces only deps imported by the app code.
# db-migrate.cjs needs pg + drizzle-orm/node-postgres which are NOT imported
# by any page/API route, so they're missing from the standalone bundle.
# Install them explicitly in the runner image so migrations run on cold start.
# Hide package.json during install because the standalone output's package.json
# contains pnpm workspace: protocol URLs that npm does not understand.
RUN mv package.json package.json.bak && npm install pg drizzle-orm --no-save --omit=dev --no-optional && mv package.json.bak package.json && chown -R nextjs:nodejs /app/node_modules

USER nextjs
EXPOSE 3000

CMD ["dumb-init", "sh", "-c", "node packages/studio/scripts/db-migrate.cjs && node packages/studio/server.js"]
