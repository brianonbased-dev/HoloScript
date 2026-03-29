FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@8.12.0 --activate

# ─── Install all deps ────────────────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/studio/package.json packages/studio/
COPY packages/core/package.json packages/core/
COPY packages/r3f-renderer/package.json packages/r3f-renderer/
COPY packages/std/package.json packages/std/
COPY packages/studio-plugin-sdk/package.json packages/studio-plugin-sdk/

RUN pnpm install --frozen-lockfile

# ─── Build ───────────────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/ ./
COPY packages/core/ packages/core/
COPY packages/r3f-renderer/ packages/r3f-renderer/
COPY packages/std/ packages/std/
COPY packages/studio-plugin-sdk/ packages/studio-plugin-sdk/
COPY packages/studio/ packages/studio/

# Build workspace dependencies in order (Studio imports from all of these)
RUN cd packages/core && pnpm build || true
RUN cd packages/std && pnpm build || true
RUN cd packages/r3f-renderer && pnpm build || true
RUN cd packages/studio-plugin-sdk && pnpm build || true

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
