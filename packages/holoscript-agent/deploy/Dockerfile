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
# holoscript-agent's package.json also lists @holoscript/uaal (workspace:^) as
# a dependency, but it is only ever used via `import type` in
# src/uaal-mesh-transport.ts — esbuild erases that import before bundling, so
# uaal never reaches dist's runtime requires. Its package.json is not copied
# into this filtered install on purpose: `pnpm install --filter` resolves the
# named packages above and tolerates the unresolvable link (it never needs to
# read or write through it), so no dangling-package placeholder is needed.
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
WORKDIR /repo
# This stage repeats the filtered install (prod-only) instead of copying
# node_modules from the build stage, for two reasons:
#
# 1. The build stage's filtered install runs under pnpm's default isolated
#    layout: a workspace package's own direct dependency (holoscript-agent's
#    `ethers`) is symlinked only inside packages/holoscript-agent/node_modules,
#    never hoisted to /repo/node_modules. Copying just /repo/node_modules (as
#    this Dockerfile used to) silently dropped `ethers`, producing
#    `ERR_MODULE_NOT_FOUND: Cannot find package 'ethers'` at container start.
#    Copying .npmrc (shamefully-hoist=true) into the build stage instead makes
#    /repo/node_modules/@holoscript/* become symlinks there — and Docker COPY
#    then refuses to replace the real directories this stage's earlier
#    per-package COPYs had already created ("cannot replace to directory
#    .../app/node_modules/@holoscript/agent-protocol with file").
# 2. A fresh --prod install here, using the same manifests + .npmrc, produces
#    a node_modules with only the production dependency closure (ethers, the
#    four @holoscript/* packages) and none of the build stage's devDependency
#    toolchain (typescript, tsup, vitest) or test/source files — smaller than
#    copying the whole build-stage /repo tree wholesale.
#
# .npmrc carries shamefully-hoist=true, required so this install's `ethers`
# (a plain dependency of a nested workspace package, not the root) hoists to
# /repo/node_modules instead of staying isolated under
# packages/holoscript-agent/node_modules. See infrastructure/Dockerfile.absorb-service
# for the same .npmrc-for-hoisting requirement on this repo's pnpm layout.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.json tsconfig.base.json .npmrc ./
COPY packages/holoscript-agent/package.json packages/holoscript-agent/
COPY packages/secrets-broker/package.json packages/secrets-broker/
COPY packages/config/package.json packages/config/
COPY packages/llm-provider/package.json packages/llm-provider/
COPY packages/agent-protocol/package.json packages/agent-protocol/
COPY scripts/check-pnpm-package-manager.mjs scripts/check-pnpm-install-integrity.mjs scripts/
RUN pnpm install --filter @holoscript/holoscript-agent --filter @holoscript/secrets-broker --filter @holoscript/config --filter @holoscript/llm-provider --filter @holoscript/agent-protocol --frozen-lockfile --prod

# Overlay the built dist output on top of the manifests-only package dirs the
# install above just linked node_modules/@holoscript/* against.
COPY --from=build /repo/packages/secrets-broker/dist packages/secrets-broker/dist
COPY --from=build /repo/packages/config/dist packages/config/dist
COPY --from=build /repo/packages/llm-provider/dist packages/llm-provider/dist
COPY --from=build /repo/packages/agent-protocol/dist packages/agent-protocol/dist
COPY --from=build /repo/packages/holoscript-agent/dist packages/holoscript-agent/dist

ENV HOLOSCRIPT_AGENT_STATE_DIR=/data/cost-state
ENV HOLOSCRIPT_AGENT_SEATS_ROOT=/data/seats
ENV HOLOSCRIPT_AGENT_AUDIT_LOG=/data/audit/audit.jsonl
ENV HOLOSCRIPT_AGENT_WORKING_DIR=/data/work

VOLUME ["/data"]

ENTRYPOINT ["node", "/repo/packages/holoscript-agent/dist/index.js"]
CMD ["help"]
