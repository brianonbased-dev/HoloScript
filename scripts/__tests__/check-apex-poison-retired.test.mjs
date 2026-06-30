#!/usr/bin/env node
/**
 * Regression tests for scripts/holo-ci/check-apex-poison-retired.mjs.
 *
 * The gate keeps stale apex-poison bridge modules out of the native compiler
 * path: old public bridge subpaths, direct source imports, and root-package
 * bridge symbols fail; SceneIR/R3FNode/native imports and comments pass.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(__dirname, '..', 'holo-ci', 'check-apex-poison-retired.mjs');

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(
      `  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
    );
  }
}

function assertMatch(text, pattern, name) {
  testsRun += 1;
  if (pattern.test(text)) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: ${pattern} not found in output:\n${text}`);
  }
}

function setup(files) {
  const root = mkdtempSync(join(tmpdir(), 'legacy-bridge-surface-'));
  mkdirSync(join(root, 'packages', 'core', 'scripts'), { recursive: true });
  writeFileSync(
    join(root, 'packages', 'core', 'tsup.config.ts'),
    "export default { entry: { index: 'src/index.ts' } };\n"
  );
  writeFileSync(join(root, 'packages', 'core', 'scripts', 'generate-types.mjs'), '\n');
  for (const [rel, body] of Object.entries(files)) {
    const abs = join(root, ...rel.split('/'));
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, body);
  }
  return root;
}

function run(root, extra = []) {
  const result = spawnSync(process.execPath, [SCRIPT, '--root', root, ...extra], {
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

function cleanup(root) {
  rmSync(root, { recursive: true, force: true });
}

console.log('check-apex-poison-retired.test.mjs');

{
  const root = setup({
    'packages/app/src/ok.ts':
      "import { SceneIRCompiler as R3FCompiler, type R3FNode } from '@holoscript/core/compiler';\n" +
      "const node: R3FNode = { id: 'root', type: 'group', props: {}, children: [] };\n" +
      "new R3FCompiler();\nvoid node;\n",
  });
  try {
    const result = run(root);
    assertEq(result.code, 0, 'SceneIR/R3FNode capability import passes');
    assertMatch(result.out, /OK - legacy bridge surfaces/, 'clean run prints OK');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({
    'services/web/src/bad.ts': "import { R3FCompiler } from '@holoscript/core/compiler/r3f';\n",
  });
  try {
    const result = run(root);
    assertEq(result.code, 1, 'legacy package subpath fails');
    assertMatch(result.out, /LEGACY-BRIDGE-IMPORT .*compiler\/r3f/, 'names legacy subpath');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({
    'scripts/bad.ts': "import { BabylonCompiler } from '../packages/core/src/compiler/BabylonCompiler';\n",
  });
  try {
    const result = run(root);
    assertEq(result.code, 1, 'legacy source import fails');
    assertMatch(result.out, /LEGACY-BRIDGE-IMPORT .*BabylonCompiler/, 'names source import');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({
    'packages/app/src/bad.ts':
      "import { R3FCompiler } from '@holoscript/core';\nnew R3FCompiler();\n",
  });
  try {
    const result = run(root);
    assertEq(result.code, 1, 'legacy root symbol import fails');
    assertMatch(result.out, /LEGACY-BRIDGE-SYMBOL R3FCompiler/, 'names root symbol');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({
    'packages/app/src/bad.ts':
      "const core = await import('@holoscript/core');\nnew core.ARCompiler();\n",
  });
  try {
    const result = run(root);
    assertEq(result.code, 1, 'legacy namespace member fails');
    assertMatch(result.out, /LEGACY-BRIDGE-SYMBOL ARCompiler/, 'names namespace symbol');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({
    'packages/app/src/comment.ts':
      "// import { PlayCanvasCompiler } from '@holoscript/core/compiler';\nexport const ok = true;\n",
  });
  try {
    const result = run(root);
    assertEq(result.code, 0, 'commented migration notes are ignored');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({});
  writeFileSync(
    join(root, 'packages', 'core', 'tsup.config.ts'),
    "export default { entry: { 'compiler/r3f': 'src/compiler/R3FCompiler.ts' } };\n"
  );
  try {
    const result = run(root);
    assertEq(result.code, 1, 'legacy package build entry fails');
    assertMatch(result.out, /compiler\\\/r3f|compiler\/r3f/, 'names static package surface');
  } finally {
    cleanup(root);
  }
}

{
  const root = setup({
    'packages/app/src/peer.ts': "import { R3FCompiler } from '@holoscript/core';\n",
    'packages/app/src/mine.ts': "import { SceneIRCompiler } from '@holoscript/core/compiler';\n",
  });
  try {
    const cleanScoped = run(root, ['--files', 'packages/app/src/mine.ts']);
    assertEq(cleanScoped.code, 0, '--files ignores unlisted peer drift');
    const badScoped = run(root, ['--files', 'packages/app/src/peer.ts']);
    assertEq(badScoped.code, 1, '--files catches listed legacy bridge symbol');
  } finally {
    cleanup(root);
  }
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
