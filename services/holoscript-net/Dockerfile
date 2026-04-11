# Build stage
ARG PNPM_VERSION=8.12.0
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store && \
	pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm run build

# Production stage
FROM node:20-alpine
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
	pnpm config set store-dir /pnpm/store && \
	pnpm install --prod --no-frozen-lockfile
EXPOSE 3000
CMD ["node", "dist/server.js"]
