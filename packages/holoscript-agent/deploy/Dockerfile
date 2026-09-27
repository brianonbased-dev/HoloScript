FROM node:22-bookworm-slim AS base
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable

FROM base AS build
WORKDIR /repo
# base sets NODE_ENV=production, and pnpm then omits devDependencies. tsup and
# typescript are devDependencies of secrets-broker, config, and llm-provider, so
# this stage installs them. The runtime stage starts FROM base and stays production.
ENV NODE_ENV=development
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json tsconfig.base.json ./
COPY packages/holoscript-agent/package.json packages/holoscript-agent/
# llm-provider depends on @holoscript/config, whose only workspace dependency
# is @holoscript/secrets-broker. Both manifests have to be present for the
# filtered install to link them.
COPY packages/secrets-broker/package.json packages/secrets-broker/
COPY packages/config/package.json packages/config/
COPY packages/llm-provider/package.json packages/llm-provider/
# The agent build emits declarations that import @holoscript/agent-protocol.
COPY packages/agent-protocol/package.json packages/agent-protocol/
# Root preinstall and postinstall invoke these. This stage copies only the
# filtered manifests, so the scripts have to be in the image or pnpm install exits 1.
COPY scripts/check-pnpm-package-manager.mjs scripts/check-pnpm-install-integrity.mjs scripts/
RUN pnpm install --filter @holoscript/holoscript-agent --filter @holoscript/secrets-broker --filter @holoscript/config --filter @holoscript/llm-provider --filter @holoscript/agent-protocol --frozen-lockfile

COPY packages/secrets-broker packages/secrets-broker
COPY packages/config packages/config
COPY packages/llm-provider packages/llm-provider
COPY packages/agent-protocol packages/agent-protocol
COPY packages/holoscript-agent packages/holoscript-agent
# llm-provider's build script emits declarations and imports @holoscript/config.
# config's dts emit needs secrets-broker's declarations (dynamic import in
# config/src/auth.ts). Order: secrets-broker, config, llm-provider.
# agent-protocol has no workspace runtime deps; the agent dts emit needs it
# built before @holoscript/holoscript-agent.
RUN pnpm --filter @holoscript/secrets-broker build
RUN pnpm --filter @holoscript/config build
RUN pnpm --filter @holoscript/llm-provider build
RUN pnpm --filter @holoscript/agent-protocol build
RUN pnpm --filter @holoscript/holoscript-agent build

FROM base AS runtime
WORKDIR /app
COPY --from=build /repo/packages/holoscript-agent/dist /app/dist
COPY --from=build /repo/packages/holoscript-agent/package.json /app/package.json
COPY --from=build /repo/packages/secrets-broker /app/node_modules/@holoscript/secrets-broker
COPY --from=build /repo/packages/config /app/node_modules/@holoscript/config
COPY --from=build /repo/packages/llm-provider /app/node_modules/@holoscript/llm-provider
COPY --from=build /repo/packages/agent-protocol /app/node_modules/@holoscript/agent-protocol
COPY --from=build /repo/node_modules /app/node_modules

ENV HOLOSCRIPT_AGENT_STATE_DIR=/data/cost-state
ENV HOLOSCRIPT_AGENT_SEATS_ROOT=/data/seats
ENV HOLOSCRIPT_AGENT_AUDIT_LOG=/data/audit/audit.jsonl
ENV HOLOSCRIPT_AGENT_WORKING_DIR=/data/work

VOLUME ["/data"]

ENTRYPOINT ["node", "/app/dist/index.js"]
CMD ["help"]
