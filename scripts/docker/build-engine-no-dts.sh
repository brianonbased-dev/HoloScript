#!/bin/sh
set -eu

cd packages/engine

# Build all engine sub-modules (auto-discover src/*/index.ts)
ENTRIES=$(find src -maxdepth 2 -name "index.ts" -not -path "*/node_modules/*" -not -path "*/__tests__/*" | sort)
npx tsup $ENTRIES \
  --format esm,cjs --no-dts --external three
