FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

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
COPY packages/studio/ packages/studio/

# Build workspace dependencies in order (Studio imports from all of these)
# Use tsup --no-dts directly — Studio only needs JS runtime, not type declarations.
# tsc --emitDeclarationOnly often fails in Docker due to missing cross-package refs.
RUN cd packages/crdt && npx tsup --no-dts
RUN cd packages/agent-protocol && npx tsup --no-dts
RUN cd packages/core && npx tsup --no-dts && node scripts/generate-types.mjs
RUN cd packages/engine && npx tsup \
      src/index.ts src/rendering/index.ts src/physics/index.ts src/runtime/index.ts \
      src/audio/index.ts src/animation/index.ts src/navigation/index.ts src/camera/index.ts \
      src/input/index.ts src/vr/index.ts src/procedural/index.ts src/tilemap/index.ts \
      src/terrain/index.ts src/particles/index.ts src/character/index.ts src/gameplay/index.ts \
      src/dialogue/index.ts src/combat/index.ts src/orbital/index.ts src/world/index.ts \
      src/environment/index.ts src/scene/index.ts src/ecs/index.ts src/hologram/index.ts \
      src/vm/index.ts src/vm-bridge/index.ts \
      --format esm,cjs --no-dts --external three
RUN cd packages/framework && npx tsup --no-dts
RUN cd packages/std && npx tsup --no-dts
RUN cd packages/absorb-service && npx tsup
RUN cd packages/r3f-renderer && npx tsup --no-dts || true
RUN cd packages/studio-plugin-sdk && npx tsup --no-dts || true
RUN cd packages/ui && npx tsup --no-dts || true
RUN cd packages/connector-core && npx tsup --no-dts || true
RUN cd packages/connector-appstore && npx tsup --no-dts || true
RUN cd packages/connector-github && npx tsup --no-dts || true
RUN cd packages/connector-railway && npx tsup --no-dts || true
RUN cd packages/connector-upstash && npx tsup --no-dts || true
RUN cd packages/connector-vscode && npx tsup --no-dts || true

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
