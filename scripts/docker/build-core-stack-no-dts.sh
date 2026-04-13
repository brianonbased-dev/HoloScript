#!/bin/sh
set -eu

# Build shared runtime dependency chain in order (no DTS for Docker runtime images).

cd packages/crdt
npx tsup --no-dts

cd ../agent-protocol
npx tsup --no-dts

cd ../core
# Use Docker-specific config that inlines workspace deps to avoid pnpm resolution issues
# tsup needs tsx for .ts configs — use .js fallback if tsx unavailable
npx tsup --config ../../scripts/docker/tsup.core.docker.js
node scripts/generate-types.mjs

cd ../..
./scripts/docker/build-engine-no-dts.sh

cd packages/framework
npx tsup --no-dts
