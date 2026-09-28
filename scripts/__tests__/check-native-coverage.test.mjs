#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holo-ci/check-native-coverage.mjs (the D.104 gate).
 *
 * The gate's job: keep native-authoring coverage (.hsplus/.holo/.hs in packages/)
 * rising or holding vs hand-authored TS traits — TS must dissolve INTO native
 * authoring, not grow as TS. These tests lock in that (a) the metric is real
 * (computed from the tree), (b) the committed baseline is HONEST — it can never
 * claim more coverage than the tree actually has (the anti-fabrication property
 * that replaces the unverified "1.32%" paper figure), and (c) a simulated
 * regression makes the gate exit non-zero (so it can't rot into a no-op).
 *
 * Run via: `node scripts/__tests__/check-native-coverage.test.mjs`
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCoverage, DEFINITION } from '../holo-ci/check-native-coverage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'check-native-coverage.mjs');
const BASELINE = join(REPO_ROOT, 'scripts', 'holo-ci', 'native-coverage-baseline.json');

let run = 0;
let failed = 0;
function check(cond, name) {
  run += 1;
  if (cond) console.log(`  PASS ${name}`);
  else {
    failed += 1;
    console.error(`  FAIL ${name}`);
  }
}

// 1. Metric is real and well-formed.
const m = computeCoverage();
check(m.native > 0, 'native count > 0');
check(m.handTsTraits > 0, 'hand-TS trait count > 0');
check(m.ratio > 0 && m.ratio <= 1, 'ratio in (0, 1]');
check(m.byExt['.hsplus'] + m.byExt['.holo'] + m.byExt['.hs'] === m.native, 'byExt sums to native');

// 2. Real, material number — not the unverified 1.32% paper figure.
check(m.ratio > 0.05, 'ratio is material (> 5%), not the fabricated 1.32%');

// 3. Committed baseline is honest: never claims MORE than reality.
const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'));
check(baseline.native <= m.native, 'baseline.native <= actual (no over-claim)');
check(baseline.ratio <= m.ratio + 1e-9, 'baseline.ratio <= actual (no over-claim)');

// 4. Gate passes at baseline, and a simulated drop fails it (non-trivial guard).
const pass = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
check(pass.status === 0, 'gate exits 0 when coverage holds');

const saved = readFileSync(BASELINE, 'utf-8');
try {
  const inflated = { ...baseline, native: baseline.native + 50 };
  writeFileSync(BASELINE, JSON.stringify(inflated, null, 2) + '\n');
  const drop = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
  check(drop.status === 1, 'gate exits 1 on a simulated native-count regression');

  const otherDefinition = { ...baseline, definition: 'native-authoring-v1' };
  writeFileSync(BASELINE, JSON.stringify(otherDefinition, null, 2) + '\n');
  const mismatch = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
  check(
    mismatch.status === 1 && mismatch.stderr.includes('different definition'),
    'gate refuses a baseline computed under another definition'
  );
} finally {
  writeFileSync(BASELINE, saved); // always restore the real baseline
}

// 5. A descriptor twin is not native authoring; a header file its package names is, and so is
//    any HoloScript file without the header. Headers that omit `src/` still find their twin.
check(baseline.definition === DEFINITION, 'committed baseline uses the current definition');
const fixture = mkdtempSync(join(tmpdir(), 'native-coverage-'));
try {
  const pkg = join(fixture, 'packages', 'demo');
  mkdirSync(join(pkg, 'src', 'parser'), { recursive: true });
  writeFileSync(
    join(pkg, 'package.json'),
    JSON.stringify({ name: 'demo', exports: { './native/shipped.hsplus': './src/shipped.hsplus' } })
  );
  writeFileSync(join(pkg, 'src', 'parser', 'Parser.ts'), 'export {};\n');
  writeFileSync(join(pkg, 'src', 'Shipped.ts'), 'export {};\n');
  writeFileSync(
    join(pkg, 'src', 'parser_twin.hsplus'),
    '// @parser_twin\n// Native .hsplus surface for demo/parser/Parser.ts.\n@trait parser_twin {}\n'
  );
  writeFileSync(
    join(pkg, 'src', 'shipped.hsplus'),
    '// @shipped\n// Native .hsplus surface for demo/Shipped.ts.\n@trait shipped {}\n'
  );
  writeFileSync(join(pkg, 'src', 'program.hsplus'), 'object Cube {\n  geometry: "cube"\n}\n');
  writeFileSync(join(pkg, 'src', 'ExampleTrait.ts'), 'export {};\n');

  const f = computeCoverage(join(fixture, 'packages'));
  check(f.descriptors === 1, 'an unshipped "Native .hsplus surface for" file is a descriptor');
  check(f.descriptorTwinsLive === 1, 'a header that omits src/ still resolves its TypeScript twin');
  check(f.shippedWithHeader === 1, 'a header file its package.json names counts as a real source');
  check(
    f.native === 2 && f.byExt['.hsplus'] === 2,
    'native counts the shipped file and the program, not the twin'
  );
  check(f.filesByExtension === 3, 'the by-extension count still sees all three files');
  check(f.handTsTraits === 1, 'hand-written TS traits are still counted');
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log(`\n[native-coverage] ${run - failed}/${run} passed.`);
process.exit(failed ? 1 : 0);
