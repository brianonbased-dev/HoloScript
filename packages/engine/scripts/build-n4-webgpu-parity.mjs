#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import {
  generateN4Artifacts,
  generateN4Scene,
  projectN4TypedFeatures,
} from '@holoscript/core/world-model';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(packageRoot, '../..');
const sourcePath = path.join(
  repoRoot,
  'packages/core/src/world-model/n4_residual_world_loop.hsplus'
);
const source = await readFile(sourcePath, 'utf8');
const artifacts = generateN4Artifacts(source);
const scene = generateN4Scene(9100, 'ood');
const features = projectN4TypedFeatures(scene, scene.objects[0]);

await build({
  entryPoints: [path.join(packageRoot, 'src/vm-bridge/n4-webgpu-parity.entry.ts')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: ['chrome120'],
  outfile: path.join(repoRoot, 'scripts/n4-residual-webgpu-parity.js'),
  plugins: [
    {
      name: 'n4-browser-safe-core-boundary',
      setup(context) {
        context.onResolve({ filter: /^@holoscript\/core\/world-model$/ }, () => ({
          path: path.join(repoRoot, 'packages/core/src/world-model/N4ResidualRuntimeParity.ts'),
        }));
      },
    },
  ],
  define: {
    __N4_MANIFEST__: JSON.stringify(artifacts.weightsManifest),
    __N4_FEATURES__: JSON.stringify(features),
  },
});

console.log(
  `[n4-webgpu] built source=${artifacts.contract.sourceDigest} ` +
    `manifest=${artifacts.weightsManifest.deterministicDigest} ` +
    `tensor=${artifacts.weightsManifest.tensorChecksum}`
);
