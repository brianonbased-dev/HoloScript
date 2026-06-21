#!/usr/bin/env node
/**
 * Source-level canary for the compiler-poison retirement track.
 *
 * The retired web/VR bridge compilers may exist as historical source while
 * deploy migration finishes, but they must not be shipped as package subpath
 * build entries or handwritten declaration files.
 */

import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const root = resolve(process.cwd());

const checks = [
  {
    file: 'packages/core/tsup.config.ts',
    patterns: [
      /['"]compiler\/r3f['"]\s*:/,
      /['"]compiler\/threejs['"]\s*:/,
      /['"]compiler\/babylon['"]\s*:/,
      /['"]compiler\/playcanvas['"]\s*:/,
      /['"]compiler\/native-2d['"]\s*:/,
      /['"]compiler\/phone-sleeve-vr['"]\s*:/,
      /['"]compiler\/flat-semantic['"]\s*:/,
      /['"]compiler\/vrr['"]\s*:/,
      /['"]compiler\/ar['"]\s*:/,
      /['"]compiler\/multi-layer['"]\s*:/,
      /src\/compiler\/R3FCompiler\.ts/,
      /src\/compiler\/ThreeJSCompiler\.ts/,
      /src\/compiler\/BabylonCompiler\.ts/,
      /src\/compiler\/PlayCanvasCompiler\.ts/,
      /src\/compiler\/Native2DCompiler\.ts/,
      /src\/compiler\/PhoneSleeveVRCompiler\.ts/,
      /src\/compiler\/FlatSemanticCompiler\.ts/,
      /src\/compiler\/VRRCompiler\.ts/,
      /src\/compiler\/ARCompiler\.ts/,
      /src\/compiler\/MultiLayerCompiler\.ts/,
    ],
  },
  {
    file: 'packages/core/scripts/generate-types.mjs',
    patterns: [
      /compiler\/r3f\.d\.ts/,
      /['"]r3f\.d\.ts['"]/,
      /Created compiler\/r3f\.d\.ts/,
    ],
  },
];

const errors = [];

for (const check of checks) {
  const abs = resolve(root, check.file);
  const source = readFileSync(abs, 'utf8');
  for (const pattern of check.patterns) {
    if (pattern.test(source)) {
      errors.push(`${relative(root, abs)} still matches ${pattern}`);
    }
  }
}

if (errors.length) {
  console.error('[apex-poison-retired] retired compiler package surface is still exposed:');
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log('[apex-poison-retired] OK - retired compiler package subpaths are not built or declared');
