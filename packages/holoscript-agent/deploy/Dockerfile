FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS build
WORKDIR /repo
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/holoscript-agent/package.json packages/holoscript-agent/
COPY packages/llm-provider/package.json packages/llm-provider/
RUN pnpm install --filter @holoscript/holoscript-agent --filter @holoscript/llm-provider --frozen-lockfile

COPY packages/llm-provider packages/llm-provider
COPY packages/holoscript-agent packages/holoscript-agent
RUN pnpm --filter @holoscript/llm-provider build
RUN pnpm --filter @holoscript/holoscript-agent build

FROM base AS runtime
WORKDIR /app
COPY --from=build /repo/packages/holoscript-agent/dist /app/dist
COPY --from=build /repo/packages/holoscript-agent/package.json /app/package.json
COPY --from=build /repo/packages/llm-provider /app/node_modules/@holoscript/llm-provider
COPY --from=build /repo/node_modules /app/node_modules

ENV HOLOSCRIPT_AGENT_STATE_DIR=/data/cost-state
ENV HOLOSCRIPT_AGENT_SEATS_ROOT=/data/seats
ENV HOLOSCRIPT_AGENT_AUDIT_LOG=/data/audit/audit.jsonl
ENV HOLOSCRIPT_AGENT_WORKING_DIR=/data/work

VOLUME ["/data"]

ENTRYPOINT ["node", "/app/dist/index.js"]
CMD ["help"]
