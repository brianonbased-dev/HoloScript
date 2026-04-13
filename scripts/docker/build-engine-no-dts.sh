#!/bin/sh
set -eu

cd packages/engine

# Use tsup.config.ts which includes the wgsl-raw-loader esbuild plugin.
# Without it, SparseLinearSolver.ts .wgsl imports fail with "No loader configured".
# The config already has dts: false set.
npx tsup
