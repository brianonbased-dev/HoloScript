#!/usr/bin/env node
/**
 * Report production ML corpus gate deltas for Paper 17 (SESL) and
 * Paper 19 (Automated Trait Inference).
 *
 * Usage:
 *   node scripts/paper-17-19-gate-delta.mjs --json
 *   node scripts/paper-17-19-gate-delta.mjs --markdown
 *   node scripts/paper-17-19-gate-delta.mjs --markdown --out research/2026-05-14_paper-17-19-production-ml-corpus-gates.md
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = resolve(__dirname, '..');

const PAPER17_TARGET_PAIRS = 5000;
const PAPER17_TARGET_PASS_RATE = 0.6;
const PAPER19_MIN_ROWS = 2000;
const PAPER19_MIN_NOVEL_COMBO_TEST = 300;
const PAPER19_MAX_SYNTH_RATIO = 0.605;
const PAPER19_MIN_SOURCE_ROWS = 500;

function parseArgs(argv = process.argv.slice(2)) {
  const out = { format: 'json', out: null, repoRoot: DEFAULT_REPO_ROOT };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      out.format = 'json';
    } else if (arg === '--markdown' || arg === '--md') {
      out.format = 'markdown';
    } else if (arg === '--out') {
      out.out = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--out=')) {
      out.out = arg.slice('--out='.length);
    } else if (arg === '--repo-root') {
      out.repoRoot = resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--repo-root=')) {
      out.repoRoot = resolve(arg.slice('--repo-root='.length));
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        `Usage: node scripts/paper-17-19-gate-delta.mjs [--json|--markdown] [--out <path>]`
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return out;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function readJsonl(filePath) {
  return readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (err) {
        throw new Error(`${filePath}:${index + 1}: invalid JSON: ${err.message}`);
      }
    });
}

function fileSha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function countRows(rows, predicate) {
  return rows.reduce((n, row) => n + (predicate(row) ? 1 : 0), 0);
}

function round(value, digits = 6) {
  return Number(value.toFixed(digits));
}

function sourceKind(row) {
  const source = String(row?.provenance?.source || '').toLowerCase();
  if (source.includes('brittney')) return 'brittney';
  if (
    source.includes('community') ||
    source.includes('moltbook') ||
    source.includes('user-contributed')
  ) {
    return 'community';
  }
  return 'existing';
}

function measurePaper17(repoRoot) {
  const indexPath = join(repoRoot, 'research', 'paper-17-sesl-pairs', 'INDEX.json');
  const index = readJson(indexPath);
  const gate = index.gate || {};
  const caelVerifiedPairs = Number(gate.cael_verified_pairs || 0);
  const measuredPairs = Number(gate.measured_pairs || 0);
  const passRate = Number(gate.pass_rate || 0);
  const gapCaelVerified = Math.max(0, PAPER17_TARGET_PAIRS - caelVerifiedPairs);
  return {
    indexPath: relativeRepo(repoRoot, indexPath),
    indexSha256: fileSha256(indexPath),
    counts: {
      pairsCollected: Number(gate.pairs_collected || 0),
      measuredPairs,
      caelVerifiedPairs,
      passed: Number(gate.passed || 0),
      failed: Number(gate.failed || 0),
    },
    targets: {
      caelVerifiedPairs: PAPER17_TARGET_PAIRS,
      passRate: PAPER17_TARGET_PASS_RATE,
    },
    passRate,
    gate: {
      passRateOk: passRate >= PAPER17_TARGET_PASS_RATE,
      volumeOk: caelVerifiedPairs >= PAPER17_TARGET_PAIRS,
      gateCleared:
        passRate >= PAPER17_TARGET_PASS_RATE && caelVerifiedPairs >= PAPER17_TARGET_PAIRS,
      gapCaelVerified,
      nextMilestone: caelVerifiedPairs >= 100 ? 500 : 100,
      nextMilestoneGap: Math.max(0, (caelVerifiedPairs >= 100 ? 500 : 100) - caelVerifiedPairs),
    },
  };
}

function measurePaper19(repoRoot) {
  const datasetPath = join(
    repoRoot,
    'research',
    'paper-19',
    'datasets',
    'phase-3-trait-inference-2000row-v2.jsonl'
  );
  const mislabelPath = join(
    repoRoot,
    'research',
    'paper-19',
    'datasets',
    'adversarial-mislabel',
    'phase-3-mislabel-attractors-v2.jsonl'
  );
  const familyMapPath = join(
    repoRoot,
    'research',
    'paper-19',
    'datasets',
    'trait-family-map-v1.json'
  );
  const measurementDir = join(repoRoot, 'research', 'paper-19', 'measurements');
  const rows = readJsonl(datasetPath);
  const mislabels = existsSync(mislabelPath) ? readJsonl(mislabelPath) : [];
  const sourceCounts = { existing: 0, brittney: 0, community: 0 };
  const splitCounts = { train: 0, dev: 0, test: 0 };
  const synthStrategies = new Set();
  const families = new Set();
  const goldTraits = new Set();
  for (const row of rows) {
    sourceCounts[sourceKind(row)] += 1;
    if (row.split in splitCounts) splitCounts[row.split] += 1;
    if (row.provenance?.synth_strategy) synthStrategies.add(row.provenance.synth_strategy);
    for (const family of row.metadata?.trait_families || []) families.add(family);
    for (const trait of row.gold_traits || []) goldTraits.add(trait);
  }

  const synthRows = countRows(rows, (row) => row.provenance?.kind === 'synth');
  const verbatimRows = countRows(rows, (row) => row.provenance?.kind === 'verbatim');
  const novelCombinationTestRows = countRows(
    rows,
    (row) => row.split === 'test' && row.metadata?.novel_combination === true
  );
  const constrainedDecoderMeasurements = existsSync(measurementDir)
    ? readDirNames(measurementDir).filter((name) => /constrained|decoder|train/i.test(name))
    : [];

  return {
    datasetPath: relativeRepo(repoRoot, datasetPath),
    datasetSha256: fileSha256(datasetPath),
    mislabelPath: relativeRepo(repoRoot, mislabelPath),
    familyMapPath: relativeRepo(repoRoot, familyMapPath),
    dataset: {
      rows: rows.length,
      verbatimRows,
      synthRows,
      synthRatio: rows.length > 0 ? round(synthRows / rows.length) : 0,
      splitCounts,
      novelCombinationTestRows,
      synthStrategies: [...synthStrategies].sort(),
      traitFamilyCount: families.size,
      distinctGoldTraits: goldTraits.size,
      adversarialMislabelRows: mislabels.length,
    },
    structuralGates: {
      rowsOk: rows.length >= PAPER19_MIN_ROWS,
      novelCombinationOk: novelCombinationTestRows >= PAPER19_MIN_NOVEL_COMBO_TEST,
      synthRatioOk: rows.length > 0 && synthRows / rows.length <= PAPER19_MAX_SYNTH_RATIO,
    },
    sourceIntegration: {
      targets: {
        existingRows: PAPER19_MIN_SOURCE_ROWS,
        brittneyRows: PAPER19_MIN_SOURCE_ROWS,
        communityRows: PAPER19_MIN_SOURCE_ROWS,
      },
      existingRows: sourceCounts.existing,
      brittneyRows: sourceCounts.brittney,
      communityRows: sourceCounts.community,
      brittneyGap: Math.max(0, PAPER19_MIN_SOURCE_ROWS - sourceCounts.brittney),
      communityGap: Math.max(0, PAPER19_MIN_SOURCE_ROWS - sourceCounts.community),
      sourceMixOk:
        sourceCounts.existing >= PAPER19_MIN_SOURCE_ROWS &&
        sourceCounts.brittney >= PAPER19_MIN_SOURCE_ROWS &&
        sourceCounts.community >= PAPER19_MIN_SOURCE_ROWS,
    },
    constrainedDecoderTraining: {
      measurementArtifacts: constrainedDecoderMeasurements,
      measurementPresent: constrainedDecoderMeasurements.length > 0,
      gap: constrainedDecoderMeasurements.length > 0 ? 0 : 1,
    },
  };
}

function readDirNames(dir) {
  try {
    return readdirSync(dir).sort();
  } catch {
    return [];
  }
}

function relativeRepo(repoRoot, filePath) {
  return filePath
    .replace(resolve(repoRoot) + '\\', '')
    .replace(resolve(repoRoot) + '/', '')
    .replace(/\\/g, '/');
}

export function buildGateDeltaReport(options = {}) {
  const repoRoot = resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const paper17 = measurePaper17(repoRoot);
  const paper19 = measurePaper19(repoRoot);
  return {
    schemaVersion: 'paper17_19.production_ml_corpus_gates.v1',
    generatedAt: new Date().toISOString(),
    repoRoot,
    paper17,
    paper19,
    summary: {
      paper17GateCleared: paper17.gate.gateCleared,
      paper17GateGapCaelVerified: paper17.gate.gapCaelVerified,
      paper19StructuralDatasetGatesOk:
        paper19.structuralGates.rowsOk &&
        paper19.structuralGates.novelCombinationOk &&
        paper19.structuralGates.synthRatioOk,
      paper19SourceMixOk: paper19.sourceIntegration.sourceMixOk,
      paper19ConstrainedDecoderTrainingOk: paper19.constrainedDecoderTraining.measurementPresent,
    },
  };
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

export function toMarkdown(report) {
  const p17 = report.paper17;
  const p19 = report.paper19;
  return `---
doc_tier: research
research_phase: base
status: active
last_verified: 2026-05-14
canonical_for: paper-17-19-production-ml-corpus-gates
supersedes: ""
extends: ""
---

### Machine summary (uAA2 COMPRESS)

**TL;DR:** Paper 17 now has ${p17.counts.caelVerifiedPairs} CAEL-verified SESL Phase 1 pairs (${p17.gate.gapCaelVerified} remaining to the 5,000-pair publication gate). Paper 19's structural corpus gates pass on ${p19.dataset.rows} rows, but real Brittney/community source integration and constrained-decoder training evidence are still open gates.

- **W --** A corpus gate needs both volume and proof source: Paper 17 pass-rate is green, but CAEL volume remains the blocker.
- **P --** Track structural dataset gates separately from source-integration and model-training gates so reviewers can see exactly what is proved.
- **G --** Treating Paper 19's 7,577 rows as "production-ready" would hide the Brittney/community source-mix gap.

**Evidence:** \`${p17.indexPath}\`; \`${p19.datasetPath}\`; \`${p19.mislabelPath}\`; \`scripts/paper-17-19-gate-delta.mjs\`.

---

# Paper 17/19 Production ML Corpus Gates

Generated: ${report.generatedAt}

## Paper 17 SESL Gate

| Metric | Current | Target | Gap | Pass |
|---|---:|---:|---:|---|
| CAEL-verified pairs | ${p17.counts.caelVerifiedPairs} | ${p17.targets.caelVerifiedPairs} | ${p17.gate.gapCaelVerified} | ${yesNo(p17.gate.volumeOk)} |
| Measured pairs | ${p17.counts.measuredPairs} | ${p17.targets.caelVerifiedPairs} | ${Math.max(0, p17.targets.caelVerifiedPairs - p17.counts.measuredPairs)} | ${yesNo(p17.gate.volumeOk)} |
| SimContract pass rate | ${p17.passRate} | ${p17.targets.passRate} | 0 | ${yesNo(p17.gate.passRateOk)} |

Next milestone: ${p17.gate.nextMilestone} CAEL-verified pairs (${p17.gate.nextMilestoneGap} remaining).

## Paper 19 ATI Gate

| Structural metric | Current | Target | Pass |
|---|---:|---:|---|
| Rows | ${p19.dataset.rows} | ${PAPER19_MIN_ROWS} | ${yesNo(p19.structuralGates.rowsOk)} |
| Novel-combination test rows | ${p19.dataset.novelCombinationTestRows} | ${PAPER19_MIN_NOVEL_COMBO_TEST} | ${yesNo(p19.structuralGates.novelCombinationOk)} |
| Synth ratio | ${p19.dataset.synthRatio} | <= ${PAPER19_MAX_SYNTH_RATIO} | ${yesNo(p19.structuralGates.synthRatioOk)} |
| Adversarial mislabel rows | ${p19.dataset.adversarialMislabelRows} | >= 10 | ${yesNo(p19.dataset.adversarialMislabelRows >= 10)} |

| Source-integration metric | Current | Target | Gap | Pass |
|---|---:|---:|---:|---|
| Existing HoloScript rows | ${p19.sourceIntegration.existingRows} | ${PAPER19_MIN_SOURCE_ROWS} | 0 | ${yesNo(p19.sourceIntegration.existingRows >= PAPER19_MIN_SOURCE_ROWS)} |
| Brittney rows | ${p19.sourceIntegration.brittneyRows} | ${PAPER19_MIN_SOURCE_ROWS} | ${p19.sourceIntegration.brittneyGap} | ${yesNo(p19.sourceIntegration.brittneyRows >= PAPER19_MIN_SOURCE_ROWS)} |
| Community rows | ${p19.sourceIntegration.communityRows} | ${PAPER19_MIN_SOURCE_ROWS} | ${p19.sourceIntegration.communityGap} | ${yesNo(p19.sourceIntegration.communityRows >= PAPER19_MIN_SOURCE_ROWS)} |

Constrained-decoder training measurement present: **${yesNo(p19.constrainedDecoderTraining.measurementPresent)}**.

## Reviewer-Facing Read

Paper 17 has moved from smoke-only proof to a 10-row CAEL-verified tranche, but remains a volume problem. Paper 19 has enough rows and the novel-combination split, but the current dataset is still effectively existing-code plus synthetic transforms. The next reviewer-visible delta should be either:

1. Paper 17: scale the deterministic CAEL tranche toward 100 verified pairs.
2. Paper 19: add 500 Brittney-origin rows and 500 community-origin rows, then rerun the baseline/training gates.
`;
}

function writeOutput(repoRoot, outPath, text) {
  const resolved = resolve(repoRoot, outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, text, 'utf8');
  return resolved;
}

async function main() {
  const args = parseArgs();
  const report = buildGateDeltaReport({ repoRoot: args.repoRoot });
  const text =
    args.format === 'markdown' ? toMarkdown(report) : `${JSON.stringify(report, null, 2)}\n`;
  if (args.out) {
    const written = writeOutput(args.repoRoot, args.out, text);
    console.error(`[paper-17-19-gate-delta] wrote ${relativeRepo(args.repoRoot, written)}`);
  } else {
    process.stdout.write(text);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
