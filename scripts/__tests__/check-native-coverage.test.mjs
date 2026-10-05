#!/usr/bin/env node
/**
 * Pure Node tests for scripts/holo-ci/check-native-coverage.mjs (the D.104 gate).
 *
 * The gate's job: keep native-authoring coverage (.hsplus/.holo/.hs in packages/)
 * rising or holding vs hand-authored TS traits — TS must dissolve INTO native
 * authoring, not grow as TS. These tests lock in that (a) the metric is real
 * (computed from the tree), (b) the committed baseline is HONEST — it can never
 * claim more coverage than the tree actually has (the anti-fabrication property
 * that replaces the unverified "1.32%" paper figure) — and CURRENT: it matches the
 * tree exactly, so a rise nobody reviewed cannot sit unseen under the ratchet,
 * (c) each ratchet, count and ratio, fails the gate on its own, planted relative
 * to the tree rather than the baseline, so neither can be deleted unnoticed and
 * no drift can hide inside the plant, and (d) the gate calls its number an upper
 * bound and prints the narrower reading without trait cards.
 *
 * Run via: `node scripts/__tests__/check-native-coverage.test.mjs`
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCoverage, DEFINITION, isTraitCard } from '../holo-ci/check-native-coverage.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SCRIPT = join(REPO_ROOT, 'scripts', 'holo-ci', 'check-native-coverage.mjs');
const BASELINE = join(REPO_ROOT, 'scripts', 'holo-ci', 'native-coverage-baseline.json');

let run = 0;
let failed = 0;
function check(cond, name, detail = '') {
  run += 1;
  if (cond) console.log(`  PASS ${name}`);
  else {
    failed += 1;
    console.error(`  FAIL ${name}`);
    if (detail) console.error(`       ${detail}`);
  }
}

// 1. Metric is real and well-formed.
const m = computeCoverage();
check(m.native > 0, 'native count > 0');
check(m.handTsTraits > 0, 'hand-TS trait count > 0');
check(m.ratio > 0 && m.ratio <= 1, 'ratio in (0, 1]');
check(m.byExt['.hsplus'] + m.byExt['.holo'] + m.byExt['.hs'] === m.native, 'byExt sums to native');
check(
  m.traitCards <= m.byExt['.holo'] &&
    m.nativeWithoutTraitCards === m.native - m.traitCards &&
    m.ratioWithoutTraitCards <= m.ratio,
  'the reading without trait cards is a subset of native, never above it'
);

// 2. Real, material number — not the unverified 1.32% paper figure.
check(m.ratio > 0.05, 'ratio is material (> 5%), not the fabricated 1.32%');

// 3. Committed baseline is honest: never claims MORE than reality.
const baseline = JSON.parse(readFileSync(BASELINE, 'utf-8'));
check(baseline.native <= m.native, 'baseline.native <= actual (no over-claim)');
check(baseline.ratio <= m.ratio + 1e-9, 'baseline.ratio <= actual (no over-claim)');

//    ...and current. The gate lets coverage rise without a reseed, so a rise nobody reviewed
//    passed every check: rewording 30 twin headers read as 30 new programs (1,503 -> 1,533).
//    The committed baseline must match the counted tree exactly; any change in what is
//    counted, up or down, needs a reseed (--update) that a reviewer sees in the diff. Twins
//    are not counted, so deleting or adding one does not trip this.
const drift = ['native', 'handTsTraits', 'ratio', 'traitCards']
  .filter((key) => baseline[key] !== m[key])
  .map((key) => `${key} ${baseline[key]} -> ${m[key]}`);
for (const ext of Object.keys(m.byExt)) {
  if (baseline.byExt?.[ext] !== m.byExt[ext]) {
    drift.push(`byExt[${ext}] ${baseline.byExt?.[ext]} -> ${m.byExt[ext]}`);
  }
}
check(
  drift.length === 0,
  'committed baseline matches the counted tree (no unreviewed drift)',
  `drift: ${drift.join(', ')}. If this is genuine native authoring, reseed with --update in ` +
    'the same change; if not, find what changed what the gate counts.'
);

// 4. Gate passes at baseline and labels its number; each ratchet fails it on its own.
const pass = spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
check(pass.status === 0, 'gate exits 0 when coverage holds');
const headline = pass.stdout.split('\n').find((line) => line.startsWith('native-coverage:')) ?? '';
check(headline.includes('upper bound'), 'gate output calls the enforced ratio an upper bound');
check(
  pass.stdout.includes('information, not gated') &&
    pass.stdout.includes(
      `without them native=${m.nativeWithoutTraitCards}, ratio=${(m.ratioWithoutTraitCards * 100).toFixed(2)}%`
    ),
  'gate output prints the reading without trait cards, marked not gated'
);

const saved = readFileSync(BASELINE, 'utf-8');
function gateAgainst(fakeBaseline) {
  writeFileSync(BASELINE, JSON.stringify(fakeBaseline, null, 2) + '\n');
  return spawnSync(process.execPath, [SCRIPT], { cwd: REPO_ROOT, encoding: 'utf-8' });
}
try {
  // Planted relative to the tree (m), not the committed baseline: the old plant added 50 to the
  // baseline, so any drift under 50 hid inside it, and it exercised only the count ratchet.
  const countOnly = gateAgainst({ ...baseline, definition: DEFINITION, native: m.native + 1, ratio: m.ratio });
  check(
    countOnly.status === 1 &&
      countOnly.stderr.includes('native authoring count dropped') &&
      !countOnly.stderr.includes('native fraction dropped'),
    'gate exits 1 when only the native count drops'
  );

  const ratioOnly = gateAgainst({
    ...baseline,
    definition: DEFINITION,
    native: m.native,
    ratio: Number((m.ratio + 0.0001).toFixed(6)),
  });
  check(
    ratioOnly.status === 1 &&
      ratioOnly.stderr.includes('native fraction dropped') &&
      !ratioOnly.stderr.includes('native authoring count dropped'),
    'gate exits 1 when only the native fraction drops'
  );

  const otherDefinition = gateAgainst({ ...baseline, definition: 'native-authoring-v1' });
  check(
    otherDefinition.status === 1 && otherDefinition.stderr.includes('different definition'),
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

// 6. A trait card is a .holo holding one @trait block and nothing else. Cards still count as
//    native; the reading without them drops exactly the cards.
const card = '@trait {\n  name: "@demo_card",\n  category: "demo",\n  props: { size: number = 1 }\n}\n';
check(
  isTraitCard(card) &&
    isTraitCard(`// leading comment\n/* and a block one */\n${card}`) &&
    isTraitCard('@trait {\n  name: "@braces",\n  description: "a } and a { inside a string"\n}\n'),
  'a .holo holding one @trait block is a trait card, after comments and with braces in strings'
);
check(
  !isTraitCard(`${card}object "Extra" {\n  geometry: "sphere"\n}\n`) &&
    !isTraitCard('@trait {\n  name: "@unclosed"\n'),
  'a @trait block with anything after it, or one that never closes, is not a card'
);
check(
  !isTraitCard('composition "Scene" {\n  object "Cube" { geometry: "cube" }\n}\n'),
  'a composition is not a trait card'
);
const cardFixture = mkdtempSync(join(tmpdir(), 'native-coverage-cards-'));
try {
  const src = join(cardFixture, 'packages', 'cards', 'src');
  mkdirSync(src, { recursive: true });
  writeFileSync(join(src, 'card.holo'), card);
  writeFileSync(join(src, 'commented.holo'), `// a card with a comment first\n${card}`);
  writeFileSync(join(src, 'scene.holo'), 'composition "Scene" {\n  object "Cube" { geometry: "cube" }\n}\n');
  writeFileSync(join(src, 'card_and_more.holo'), `${card}object "Extra" {\n  geometry: "sphere"\n}\n`);
  writeFileSync(join(src, 'CardTrait.ts'), 'export {};\n');

  const c = computeCoverage(join(cardFixture, 'packages'));
  check(
    c.native === 4 &&
      c.traitCards === 2 &&
      c.nativeWithoutTraitCards === 2 &&
      c.ratio === 0.8 &&
      c.ratioWithoutTraitCards === Number((2 / 3).toFixed(6)),
    'trait cards still count as native; the reading without them drops exactly the cards'
  );
} finally {
  rmSync(cardFixture, { recursive: true, force: true });
}

console.log(`\n[native-coverage] ${run - failed}/${run} passed.`);
process.exit(failed ? 1 : 0);
