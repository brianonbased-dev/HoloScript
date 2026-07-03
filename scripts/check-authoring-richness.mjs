#!/usr/bin/env node
/**
 * check-authoring-richness — reproducible version of the 2026-07-03
 * "realistic-authoring" research's grep methodology (see
 * research/2026-07-03_holoscript-realistic-authoring-docs-PLAN.md, §2 row 6
 * and §6 Stage 4 in the ai-ecosystem repo).
 *
 * Classifies every .holo file under a directory (default: examples/) into:
 *   - "rich"            — has @advanced_pbr / @pbr / pbr_material /
 *                          @gaussian_splat / an imported .glb|.gltf model ref
 *   - "primitive-only"  — has cube/sphere/box/cylinder/plane/capsule geometry
 *                          keywords and NONE of the rich signals above
 *   - "non-visual"      — neither pattern present (data/logic/config files)
 *
 * This exists so Stage 4's "cut the primitive-only rate by at least half"
 * gate is measured mechanically, not eyeballed — the same methodology run
 * before and after Stages 0-2 land, diffed against a committed baseline.
 *
 * Usage:
 *   node scripts/check-authoring-richness.mjs                     # scan examples/, print summary
 *   node scripts/check-authoring-richness.mjs --dir=<path>        # scan a different directory
 *   node scripts/check-authoring-richness.mjs <path>               # positional form of --dir
 *   node scripts/check-authoring-richness.mjs --json               # also print machine-readable JSON
 *   node scripts/check-authoring-richness.mjs --baseline=<file>    # print before/after delta
 *   node scripts/check-authoring-richness.mjs --check --baseline=<file> --min-improvement=<percent>
 *                                                                    # exit 1 if the rich-rate gain
 *                                                                    # vs baseline is below threshold
 *
 * Baseline snapshot from this research: examples/.authoring-richness-baseline-2026-07-03.json
 * (28/380 = 7.4% rich corpus-wide at time of writing).
 *
 * There is deliberately no package.json `check:*:gate` variant with a baked-in
 * --min-improvement threshold: the plan's Stage 4 gate target ("cut the
 * primitive-only rate on *newly generated* content by at least half") is
 * measured against freshly generated output, not this static corpus, and
 * isn't ratified as a CI gate yet. Whoever wires that gate should call this
 * script directly, e.g.:
 *   node scripts/check-authoring-richness.mjs --check \
 *     --baseline=examples/.authoring-richness-baseline-2026-07-03.json \
 *     --min-improvement=<agreed-threshold> --dir=<freshly-generated-output-dir>
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { dirname, join, relative, sep } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..');
const DEFAULT_BASELINE_PATH = join(
  ROOT,
  'examples',
  '.authoring-richness-baseline-2026-07-03.json'
);

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.turbo', 'out']);

// Rich signals — material/PBR/imported-mesh authoring, not flat primitive shape.
// The imported-mesh signal is scoped to the `model:` key (as used in
// realistic-forest.refreshed.holo's `object "Boulder" { model: "models/boulder.glb" }`)
// rather than any string containing ".glb" — a bare `geometry: "x.glb"` path is
// still effectively a primitive-style mesh swap, not the material-composed
// authoring pattern this gate measures. This scoping reproduces the research's
// exact 28/380 = 7.4% corpus-wide baseline (see plan doc §2 row 6).
const RICH_PATTERNS = [
  /@advanced_pbr/i,
  /@pbr\b/i,
  /\bpbr_material\b/i,
  /@gaussian_splat/i,
  /\bmodel\s*:\s*"[^"]*\.(glb|gltf)/i,
];

// Primitive-geometry signals — the deterministic-fallback shape vocabulary
// (mirrors generators.ts GEOMETRY_KEYWORDS: cube/sphere/box/cylinder/plane/capsule).
const PRIMITIVE_PATTERNS = [
  /\bcube\b/i,
  /\bsphere\b/i,
  /\bbox\b/i,
  /\bcylinder\b/i,
  /\bplane\b/i,
  /\bcapsule\b/i,
];

function toRepoPath(filepath) {
  return relative(ROOT, filepath).split(sep).join('/');
}

function collectHoloFiles(dir) {
  const files = [];
  function walk(current) {
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(join(current, entry.name));
        continue;
      }
      if (entry.isFile() && /\.holo$/i.test(entry.name)) {
        files.push(join(current, entry.name));
      }
    }
  }
  walk(dir);
  return files.sort((a, b) => a.localeCompare(b));
}

function classifyFile(absPath) {
  let code = '';
  try {
    code = readFileSync(absPath, 'utf8');
  } catch {
    return 'non-visual';
  }
  const isRich = RICH_PATTERNS.some((re) => re.test(code));
  if (isRich) return 'rich';
  const isPrimitive = PRIMITIVE_PATTERNS.some((re) => re.test(code));
  if (isPrimitive) return 'primitive-only';
  return 'non-visual';
}

function classifyAll(files) {
  const entries = files.map((absPath) => ({
    path: toRepoPath(absPath),
    category: classifyFile(absPath),
  }));
  const counts = { rich: 0, 'primitive-only': 0, 'non-visual': 0 };
  for (const entry of entries) counts[entry.category]++;
  return { entries, counts };
}

function pct(part, total) {
  if (total === 0) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

function buildSnapshot(scanDir, counts, total) {
  return {
    generatedAt: new Date().toISOString(),
    scanDir: toRepoPath(scanDir),
    totalFiles: total,
    counts,
    richPercent: Number(pct(counts.rich, total)),
    primitiveOnlyPercent: Number(pct(counts['primitive-only'], total)),
    nonVisualPercent: Number(pct(counts['non-visual'], total)),
  };
}

function printSummary(snapshot) {
  const { totalFiles, counts } = snapshot;
  console.log('Authoring richness scan');
  console.log(`  scanned: ${snapshot.scanDir} (${totalFiles} .holo files)`);
  console.log(
    `  rich:            ${counts.rich}/${totalFiles} = ${pct(counts.rich, totalFiles)}%`
  );
  console.log(
    `  primitive-only:  ${counts['primitive-only']}/${totalFiles} = ${pct(counts['primitive-only'], totalFiles)}%`
  );
  console.log(
    `  non-visual:      ${counts['non-visual']}/${totalFiles} = ${pct(counts['non-visual'], totalFiles)}%`
  );
}

function printDelta(baseline, current) {
  console.log('');
  console.log(`Baseline: ${baseline.scanDir} @ ${baseline.generatedAt} (${baseline.totalFiles} files)`);
  console.log(
    `  rich:           ${baseline.counts.rich}/${baseline.totalFiles} (${baseline.richPercent}%) -> ` +
      `${current.counts.rich}/${current.totalFiles} (${current.richPercent}%)  ` +
      `delta: ${(current.richPercent - baseline.richPercent).toFixed(1)} pts`
  );
  console.log(
    `  primitive-only: ${baseline.counts['primitive-only']}/${baseline.totalFiles} (${baseline.primitiveOnlyPercent}%) -> ` +
      `${current.counts['primitive-only']}/${current.totalFiles} (${current.primitiveOnlyPercent}%)  ` +
      `delta: ${(current.primitiveOnlyPercent - baseline.primitiveOnlyPercent).toFixed(1)} pts`
  );
}

function parseArgs(argv) {
  const flags = { positional: [] };
  for (const raw of argv) {
    if (raw.startsWith('--dir=')) flags.dir = raw.slice('--dir='.length);
    else if (raw.startsWith('--baseline=')) flags.baseline = raw.slice('--baseline='.length);
    else if (raw.startsWith('--min-improvement='))
      flags.minImprovement = Number(raw.slice('--min-improvement='.length));
    else if (raw === '--json') flags.json = true;
    else if (raw === '--check') flags.check = true;
    else if (raw === '--save-baseline') flags.saveBaseline = true;
    else if (!raw.startsWith('--')) flags.positional.push(raw);
  }
  return flags;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const scanDirInput = flags.dir || flags.positional[0] || 'examples';
  const scanDir = join(ROOT, scanDirInput);

  if (!existsSync(scanDir)) {
    console.error(`ERROR scan directory not found: ${toRepoPath(scanDir)}`);
    process.exit(1);
  }

  const files = collectHoloFiles(scanDir);
  const { entries, counts } = classifyAll(files);
  const snapshot = buildSnapshot(scanDir, counts, files.length);

  printSummary(snapshot);

  let checkFailed = false;

  if (flags.baseline) {
    const baselinePath = join(ROOT, flags.baseline);
    if (!existsSync(baselinePath)) {
      console.error(`ERROR baseline file not found: ${flags.baseline}`);
      process.exit(1);
    }
    const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
    printDelta(baseline, snapshot);

    if (flags.check && typeof flags.minImprovement === 'number' && !Number.isNaN(flags.minImprovement)) {
      const actualImprovement = snapshot.richPercent - baseline.richPercent;
      console.log('');
      console.log(
        `  gate: require >= ${flags.minImprovement} pt rich-rate improvement, got ${actualImprovement.toFixed(1)} pt`
      );
      if (actualImprovement < flags.minImprovement) {
        console.error('ERROR rich-rate improvement below --min-improvement threshold.');
        checkFailed = true;
      }
    }
  }

  if (flags.json) {
    process.stdout.write(
      `\n__AUTHORING_RICHNESS__\n${JSON.stringify({ ...snapshot, entries }, null, 2)}\n`
    );
  }

  if (flags.saveBaseline) {
    const outPath = flags.baseline ? join(ROOT, flags.baseline) : DEFAULT_BASELINE_PATH;
    writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    console.log(`\nBaseline snapshot written: ${toRepoPath(outPath)}`);
  }

  process.exit(flags.check && checkFailed ? 1 : 0);
}

main();
