#!/bin/sh
set -eu

# Build shared runtime dependency chain in order (no DTS for Docker runtime images).

# core-types first — pure types + a few runtime values, no workspace deps.
# Core's Docker bundle requires @holoscript/core-types/ans.cjs at runtime
# (e.g. A2AAgentCardCompiler imports ANSCapabilityPath).
cd packages/core-types
pnpm exec tsup --no-dts

cd ../crdt
pnpm exec tsup --no-dts

cd ../agent-protocol
pnpm exec tsup --no-dts

# Build engine + framework BEFORE core (core inlines them in Docker)
cd ../..
./scripts/docker/build-engine-no-dts.sh

cd packages/framework
pnpm exec tsup --no-dts

cd ../platform
pnpm exec tsup --no-dts

cd ../mesh
pnpm exec tsup --no-dts

# Core last — Docker config inlines all workspace deps
cd ../core
pnpm exec tsup --config ../../scripts/docker/tsup.core.docker.cjs
node scripts/generate-types.mjs
