# HoloScript Net Service — Monorepo Build
#
# Must be built from workspace root: docker build -f services/holoscript-net/Dockerfile .
# Dependency chain: holoscript-net → core + mcp-server + runtime + r3f-renderer

ARG PNPM_VERSION=8.12.0

FROM node:20-alpine AS base
ARG PNPM_VERSION
RUN apk add --no-cache libc6-compat dumb-init chromium
RUN if [ -x /usr/bin/chromium-browser ] && [ ! -e /usr/bin/chromium ]; then ln -s /usr/bin/chromium-browser /usr/bin/chromium; fi
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

# Collect all package manifests (package.json + tsconfig*.json) for workspace-aware install
FROM base AS manifests
WORKDIR /app
COPY . .
RUN find packages services benchmarks \( -name "package.json" -o -name "tsconfig*.json" \) \
	-not -path "*/node_modules/*" \
	-exec sh -c 'mkdir -p /manifests/$(dirname {}) && cp {} /manifests/{}' \; 2>/dev/null; true

# Build stage — workspace-aware, uses root pnpm-lock.yaml
FROM base AS builder
WORKDIR /app

# Copy workspace config + all package manifests for lockfile resolution
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc tsconfig.base.json tsconfig.json ./
COPY --from=manifests /manifests/ ./

# Install all workspace dependencies using the frozen root lockfile
RUN pnpm install --frozen-lockfile --ignore-scripts

# Copy source packages in dependency order
COPY packages/crdt/ packages/crdt/
COPY packages/crdt-spatial/ packages/crdt-spatial/
COPY packages/agent-protocol/ packages/agent-protocol/
COPY packages/core-types/ packages/core-types/
COPY packages/core/ packages/core/
COPY packages/marketplace-api/ packages/marketplace-api/
COPY packages/mesh/ packages/mesh/
COPY packages/platform/ packages/platform/
COPY packages/framework/ packages/framework/
COPY packages/uaal/ packages/uaal/
COPY packages/engine/ packages/engine/
COPY packages/ui/ packages/ui/
COPY packages/llm-provider/ packages/llm-provider/
COPY packages/config/ packages/config/
COPY packages/cli/ packages/cli/
COPY packages/mcp-server/ packages/mcp-server/
COPY packages/runtime/ packages/runtime/
COPY packages/r3f-renderer/ packages/r3f-renderer/
COPY services/holoscript-net/ services/holoscript-net/

# Build workspace dependencies (no dts for speed in Docker)
RUN cd packages/crdt && npx tsup --no-dts
RUN cd packages/crdt-spatial && npx tsup --no-dts
RUN cd packages/agent-protocol && npx tsup --no-dts
RUN cd packages/core-types && npx tsup --no-dts
RUN cd packages/config && npx tsup --no-dts
RUN cd packages/llm-provider && npx tsup --no-dts
RUN cd packages/platform && npx tsup --no-dts
RUN cd packages/core && npx tsup --no-dts
RUN cd packages/mesh && npx tsup --no-dts
RUN cd packages/framework && npx tsup --config tsup.config.ts --no-dts
RUN cd packages/uaal && npx tsup --no-dts
RUN cd packages/engine && npx tsup --no-dts
RUN cd packages/ui && npx tsup --no-dts
RUN cd packages/mcp-server && npx tsup --no-dts
RUN cd packages/runtime && npx tsup --no-dts
RUN cd packages/r3f-renderer && npx tsup --no-dts

# Force workspace symlinks during client bundling. The manifest-first Docker
# install can leave service-local workspace links stale after the full source
# packages are copied into the image.
RUN mkdir -p /app/node_modules/@holoscript && \
	rm -rf /app/node_modules/@holoscript/core \
		/app/node_modules/@holoscript/core-types \
		/app/node_modules/@holoscript/mesh \
		/app/node_modules/@holoscript/platform \
		/app/node_modules/@holoscript/framework \
		/app/node_modules/@holoscript/mcp-server \
		/app/node_modules/@holoscript/runtime \
		/app/node_modules/@holoscript/r3f-renderer \
		/app/node_modules/@holoscript/uaal \
		/app/node_modules/@holoscript/engine \
		/app/node_modules/@holoscript/ui \
		/app/node_modules/@holoscript/config \
		/app/node_modules/@holoscript/llm-provider \
		/app/node_modules/@holoscript/crdt \
		/app/node_modules/@holoscript/crdt-spatial \
		/app/node_modules/@holoscript/agent-protocol && \
	ln -s /app/packages/core /app/node_modules/@holoscript/core && \
	ln -s /app/packages/core-types /app/node_modules/@holoscript/core-types && \
	ln -s /app/packages/mesh /app/node_modules/@holoscript/mesh && \
	ln -s /app/packages/platform /app/node_modules/@holoscript/platform && \
	ln -s /app/packages/framework /app/node_modules/@holoscript/framework && \
	ln -s /app/packages/mcp-server /app/node_modules/@holoscript/mcp-server && \
	ln -s /app/packages/runtime /app/node_modules/@holoscript/runtime && \
	ln -s /app/packages/r3f-renderer /app/node_modules/@holoscript/r3f-renderer && \
	ln -s /app/packages/uaal /app/node_modules/@holoscript/uaal && \
	ln -s /app/packages/engine /app/node_modules/@holoscript/engine && \
	ln -s /app/packages/ui /app/node_modules/@holoscript/ui && \
	ln -s /app/packages/config /app/node_modules/@holoscript/config && \
	ln -s /app/packages/llm-provider /app/node_modules/@holoscript/llm-provider && \
	ln -s /app/packages/crdt /app/node_modules/@holoscript/crdt && \
	ln -s /app/packages/crdt-spatial /app/node_modules/@holoscript/crdt-spatial && \
	ln -s /app/packages/agent-protocol /app/node_modules/@holoscript/agent-protocol

# Build the service (client + server)
WORKDIR /app/services/holoscript-net
RUN pnpm run build:client && \
	npx tsup server.ts --out-dir dist/server --external @holoscript/mcp-server --external @holoscript/core

# Production stage
FROM base AS runner
WORKDIR /app

# Copy workspace config + manifests for proper workspace symlink resolution
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc ./
COPY --from=manifests /manifests/ ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod --ignore-scripts

# Copy built artifacts from builder
COPY --from=builder /app/packages/crdt/dist packages/crdt/dist
COPY --from=builder /app/packages/crdt-spatial/dist packages/crdt-spatial/dist
COPY --from=builder /app/packages/agent-protocol/dist packages/agent-protocol/dist
COPY --from=builder /app/packages/core-types/dist packages/core-types/dist
COPY --from=builder /app/packages/mesh/dist packages/mesh/dist
COPY --from=builder /app/packages/platform/dist packages/platform/dist
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/framework/dist packages/framework/dist
COPY --from=builder /app/packages/uaal/dist packages/uaal/dist
COPY --from=builder /app/packages/engine/dist packages/engine/dist
COPY --from=builder /app/packages/ui/dist packages/ui/dist
COPY --from=builder /app/packages/config/dist packages/config/dist
COPY --from=builder /app/packages/llm-provider/dist packages/llm-provider/dist
COPY --from=builder /app/packages/mcp-server/dist packages/mcp-server/dist
COPY --from=builder /app/packages/runtime/dist packages/runtime/dist
COPY --from=builder /app/packages/r3f-renderer/dist packages/r3f-renderer/dist
COPY --from=builder /app/services/holoscript-net/dist services/holoscript-net/dist

# Force workspace symlinks so externalized packages resolve at runtime
RUN mkdir -p /app/node_modules/@holoscript && \
	ln -sfn /app/packages/core /app/node_modules/@holoscript/core && \
	ln -sfn /app/packages/core-types /app/node_modules/@holoscript/core-types && \
	ln -sfn /app/packages/mesh /app/node_modules/@holoscript/mesh && \
	ln -sfn /app/packages/platform /app/node_modules/@holoscript/platform && \
	ln -sfn /app/packages/framework /app/node_modules/@holoscript/framework && \
	ln -sfn /app/packages/mcp-server /app/node_modules/@holoscript/mcp-server && \
	ln -sfn /app/packages/runtime /app/node_modules/@holoscript/runtime && \
	ln -sfn /app/packages/r3f-renderer /app/node_modules/@holoscript/r3f-renderer && \
	ln -sfn /app/packages/uaal /app/node_modules/@holoscript/uaal && \
	ln -sfn /app/packages/engine /app/node_modules/@holoscript/engine && \
	ln -sfn /app/packages/ui /app/node_modules/@holoscript/ui && \
	ln -sfn /app/packages/config /app/node_modules/@holoscript/config && \
	ln -sfn /app/packages/llm-provider /app/node_modules/@holoscript/llm-provider && \
	ln -sfn /app/packages/crdt /app/node_modules/@holoscript/crdt && \
	ln -sfn /app/packages/crdt-spatial /app/node_modules/@holoscript/crdt-spatial && \
	ln -sfn /app/packages/agent-protocol /app/node_modules/@holoscript/agent-protocol

WORKDIR /app/services/holoscript-net
EXPOSE 3000
CMD ["dumb-init", "node", "dist/server/server.js"]
