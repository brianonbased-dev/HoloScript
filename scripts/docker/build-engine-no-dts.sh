#!/bin/sh
set -eu

cd packages/engine

npx tsup \
  src/index.ts src/rendering/index.ts src/physics/index.ts src/runtime/index.ts \
  src/audio/index.ts src/animation/index.ts src/navigation/index.ts src/camera/index.ts \
  src/input/index.ts src/vr/index.ts src/procedural/index.ts src/tilemap/index.ts \
  src/terrain/index.ts src/particles/index.ts src/character/index.ts src/gameplay/index.ts \
  src/dialogue/index.ts src/combat/index.ts src/orbital/index.ts src/world/index.ts \
  src/environment/index.ts src/scene/index.ts src/ecs/index.ts src/hologram/index.ts \
  src/vm/index.ts src/vm-bridge/index.ts \
  --format esm,cjs --no-dts --external three
