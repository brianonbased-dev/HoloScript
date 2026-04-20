#!/bin/sh
set -eu

# Build shared runtime dependency chain in order (no DTS for Docker runtime images).

# core-types first — pure types + a few runtime values, no workspace deps.
# Core's Docker bundle requires @holoscript/core-types/ans.cjs at runtime
# (e.g. A2AAgentCardCompiler imports ANSCapabilityPath).
cd packages/core-types
npx tsup --no-dts

cd ../crdt
npx tsup --no-dts

cd ../agent-protocol
npx tsup --no-dts

# Build engine + framework BEFORE core (core inlines them in Docker)
cd ../..
./scripts/docker/build-engine-no-dts.sh

cd packages/framework
npx tsup --no-dts

cd ../platform
npx tsup --no-dts

cd ../mesh
npx tsup --no-dts

# Core last — Docker config inlines all workspace deps
cd ../core
npx tsup --config ../../scripts/docker/tsup.core.docker.cjs
node scripts/generate-types.mjs
