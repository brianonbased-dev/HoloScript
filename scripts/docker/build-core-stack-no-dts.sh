#!/bin/sh
set -eu

# Build shared runtime dependency chain in order (no DTS for Docker runtime images).

cd packages/crdt
npx tsup --no-dts

cd ../agent-protocol
npx tsup --no-dts

cd ../core
# Docker config inlines all workspace deps (engine, framework, mesh, platform, plugins)
# Uses .cjs to prevent tsup from ESM-bundling the config file
npx tsup --config ../../scripts/docker/tsup.core.docker.cjs
node scripts/generate-types.mjs

cd ../..
./scripts/docker/build-engine-no-dts.sh

cd packages/framework
npx tsup --no-dts
