FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

# ─── Collect all package.json for lockfile resolution ────────────────────────
# pnpm install --frozen-lockfile needs every workspace package.json present.
# We copy the full repo into a temp stage, then extract only package.json files.
FROM base AS manifests
WORKDIR /app
COPY . .
RUN find packages -name "package.json" -not -path "*/node_modules/*" -exec sh -c 'mkdir -p /manifests/$(dirname {}) && cp {} /manifests/{}' \; \
 && find services -name "package.json" -not -path "*/node_modules/*" -exec sh -c 'mkdir -p /manifests/$(dirname {}) && cp {} /manifests/{}' \; 2>/dev/null; true

# ─── Install all deps ────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY --from=manifests /manifests/ ./

RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/ ./
COPY packages/crdt/ packages/crdt/
COPY packages/core/ packages/core/
COPY packages/std/ packages/std/
COPY packages/ui/ packages/ui/
COPY packages/absorb-service/ packages/absorb-service/
COPY packages/agent-protocol/ packages/agent-protocol/
COPY packages/r3f-renderer/ packages/r3f-renderer/
COPY packages/studio-plugin-sdk/ packages/studio-plugin-sdk/
COPY packages/studio/ packages/studio/

# Build workspace dependencies in order (Studio imports from all of these)
# Use tsup --no-dts directly — Studio only needs JS runtime, not type declarations.
# tsc --emitDeclarationOnly often fails in Docker due to missing cross-package refs.
RUN cd packages/crdt && npx tsup --no-dts
RUN cd packages/agent-protocol && npx tsup --no-dts
RUN cd packages/core && npx tsup --no-dts && node scripts/generate-types.mjs
RUN cd packages/std && npx tsup --no-dts
RUN cd packages/absorb-service && npx tsup
RUN cd packages/r3f-renderer && npx tsup --no-dts || true
RUN cd packages/studio-plugin-sdk && npx tsup --no-dts || true
RUN cd packages/ui && npx tsup --no-dts || true

# Build Studio — standalone output is enabled on Linux
ENV NEXT_TELEMETRY_DISABLED=1
RUN cd packages/studio && pnpm next build

# ─── Production runner ───────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/packages/studio/.next/standalone ./
COPY --from=builder /app/packages/studio/.next/static ./packages/studio/.next/static
COPY --from=builder /app/packages/studio/public ./packages/studio/public

USER nextjs
EXPOSE 3000

CMD ["node", "packages/studio/server.js"]
