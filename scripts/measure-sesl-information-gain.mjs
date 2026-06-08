#!/usr/bin/env node
/**
 * Measure SESL information-gain metric: composition-shape entropy over
 * trait-family sets, with collapse detection.
 *
 * Proves SESL self-play adds learnable information beyond the seed corpus
 * by comparing entropy (diversity of trait-family compositions) between
 * iterations.
 *
 * Usage:
 *   node scripts/measure-sesl-information-gain.mjs --seed=research/paper-17-sesl-pairs/fixtures/phase1-seed.jsonl --generated=research/paper-17-sesl-pairs/phase-1-corpus.jsonl --json
 *   node scripts/measure-sesl-information-gain.mjs --seed=seed.jsonl --generated=phase-1.jsonl --markdown
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const HOME = process.env.USERPROFILE || os.homedir();

const args = parseArgs(process.argv.slice(2));
const format = args.markdown ? 'markdown' : 'json';
const seedPath = resolveInputPath(args.seed || args._[0], 'seed');
const generatedPath = resolveInputPath(args.generated || args._[1], 'generated');
const collapseThreshold = Number(args['collapse-threshold'] ?? 0.5);
const collapseDropRatio = Number(args['collapse-drop-ratio'] ?? 0.2);

if (!Number.isFinite(collapseThreshold) || collapseThreshold < 0 || collapseThreshold > 1) {
  failCli('--collapse-threshold must be between 0 and 1');
}
if (!Number.isFinite(collapseDropRatio) || collapseDropRatio < 0 || collapseDropRatio > 1) {
  failCli('--collapse-drop-ratio must be between 0 and 1');
}

const seedMeasurement = measureCorpus(seedPath, { label: 'seed', iteration: 0 });
const generatedMeasurement = measureCorpus(generatedPath, { label: 'generated', iteration: 1 });
const comparison = compareMeasurements(seedMeasurement, generatedMeasurement, {
  collapseThreshold,
  collapseDropRatio,
});

const report = buildReport({
  seed: seedMeasurement,
  generated: generatedMeasurement,
  comparison,
  meta: {
    measuredAt: new Date().toISOString(),
    schemaVersion: 'paper17.sesl.information-gain.v1',
    collapseThreshold,
    collapseDropRatio,
  },
});

if (format === 'markdown') {
  console.log(toMarkdown(report));
} else {
  console.log(JSON.stringify(report, null, 2));
}

if (args['fail-gate'] && comparison.collapseFlag) {
  process.exit(2);
}

// ── Argument parsing ───────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      out._.push(arg);
      continue;
    }
    const body = arg.slice(2);
    const eq = body.indexOf('=');
    if (eq === -1) {
      // --key value  (consume next token if it exists and is not another flag)
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        out[body] = next;
        i += 1;
      } else {
        out[body] = true;
      }
    } else {
      out[body.slice(0, eq)] = body.slice(eq + 1);
    }
  }
  return out;
}

function resolveInputPath(explicit, role) {
  const candidates = [
    explicit,
    role === 'seed'
      ? path.join(REPO_ROOT, 'research', 'paper-17-sesl-pairs', 'fixtures', 'phase1-seed.jsonl')
      : null,
    role === 'generated'
      ? path.join(REPO_ROOT, 'research', 'paper-17-sesl-pairs', 'phase-1-corpus.jsonl')
      : null,
    path.join(
      HOME,
      '.ai-ecosystem',
      'research',
      'paper-17-sesl-corpus',
      role === 'seed' ? 'phase-0-corpus.jsonl' : 'phase-1-corpus.jsonl'
    ),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const resolved = path.resolve(String(candidate));
    if (fs.existsSync(resolved)) return resolved;
  }

  failCli(
    `No ${role} corpus found. Pass --${role}=<jsonl> or ensure default paths exist. Checked: ${candidates.map((c) => path.resolve(String(c))).join('; ')}`
  );
}

// ── Corpus measurement ─────────────────────────────────────────────────────

function measureCorpus(inputPath, options) {
  const records = readJsonl(inputPath);
  const totalRecords = records.length;

  // Trait-family set distribution
  const traitSetCounts = new Map(); // JSON-sorted trait array -> count
  const compositionShapeCounts = new Map(); // composition_shape_hash -> count

  for (const record of records) {
    const traits = extractTraitFamilySet(record);
    const traitKey = JSON.stringify(traits);
    traitSetCounts.set(traitKey, (traitSetCounts.get(traitKey) || 0) + 1);

    const shapeHash = extractCompositionShapeHash(record);
    if (shapeHash) {
      compositionShapeCounts.set(shapeHash, (compositionShapeCounts.get(shapeHash) || 0) + 1);
    }
  }

  const traitEntropy = shannonEntropy(traitSetCounts, totalRecords);
  const uniqueTraitSets = traitSetCounts.size;
  const maxTraitEntropy = uniqueTraitSets > 1 ? Math.log2(uniqueTraitSets) : 0;
  const normalizedTraitEntropy = maxTraitEntropy > 0 ? traitEntropy / maxTraitEntropy : 0;

  const shapeEntropy = shannonEntropy(compositionShapeCounts, totalRecords);
  const uniqueShapes = compositionShapeCounts.size;
  const maxShapeEntropy = uniqueShapes > 1 ? Math.log2(uniqueShapes) : 0;
  const normalizedShapeEntropy = maxShapeEntropy > 0 ? shapeEntropy / maxShapeEntropy : 0;

  // Diversity: Simpson's index (1 - sum(p^2)) for trait sets
  let simpsonDiversity = 0;
  for (const count of traitSetCounts.values()) {
    const p = count / totalRecords;
    simpsonDiversity += p * p;
  }
  simpsonDiversity = 1 - simpsonDiversity;

  return {
    inputPath,
    label: options.label,
    iteration: options.iteration,
    counts: {
      totalRecords,
      uniqueTraitSets,
      uniqueCompositionShapes: uniqueShapes,
    },
    entropy: {
      traitSetEntropy: round(traitEntropy, 6),
      maxTraitEntropy: round(maxTraitEntropy, 6),
      normalizedTraitEntropy: round(normalizedTraitEntropy, 6),
      compositionShapeEntropy: round(shapeEntropy, 6),
      maxShapeEntropy: round(maxShapeEntropy, 6),
      normalizedShapeEntropy: round(normalizedShapeEntropy, 6),
      simpsonDiversity: round(simpsonDiversity, 6),
    },
    distributions: {
      traitSets: Object.fromEntries([...traitSetCounts.entries()].map(([k, v]) => [k, v])),
      compositionShapes: Object.fromEntries(
        [...compositionShapeCounts.entries()].map(([k, v]) => [k, v])
      ),
    },
  };
}

function readJsonl(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8');
  const ext = path.extname(inputPath).toLowerCase();

  if (ext === '.json') {
    const doc = JSON.parse(raw);
    return Array.isArray(doc) ? doc : doc.records || doc.pairs || [];
  }

  const records = [];
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      records.push(JSON.parse(trimmed));
    } catch {
      // skip malformed
    }
  }
  return records;
}

function extractTraitFamilySet(record) {
  if (Array.isArray(record.trait_family_set)) {
    return [...record.trait_family_set].sort();
  }
  if (record.provenance && Array.isArray(record.provenance.trait_family_set)) {
    return [...record.provenance.trait_family_set].sort();
  }
  return [];
}

function extractCompositionShapeHash(record) {
  if (record.composition_shape_hash) {
    return String(record.composition_shape_hash);
  }
  if (record.provenance && record.provenance.composition_shape_hash) {
    return String(record.provenance.composition_shape_hash);
  }
  return null;
}

function shannonEntropy(countMap, total) {
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of countMap.values()) {
    if (count === 0) continue;
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}

// ── Comparison ─────────────────────────────────────────────────────────────

function compareMeasurements(seed, generated, options) {
  const infoGain = round(generated.entropy.traitSetEntropy - seed.entropy.traitSetEntropy, 6);
  const normalizedInfoGain = round(
    generated.entropy.normalizedTraitEntropy - seed.entropy.normalizedTraitEntropy,
    6
  );
  const shapeInfoGain = round(
    generated.entropy.compositionShapeEntropy - seed.entropy.compositionShapeEntropy,
    6
  );

  const relativeDrop =
    seed.entropy.normalizedTraitEntropy > 0
      ? (seed.entropy.normalizedTraitEntropy - generated.entropy.normalizedTraitEntropy) /
        seed.entropy.normalizedTraitEntropy
      : 0;

  const collapseFlag = Boolean(
    generated.entropy.normalizedTraitEntropy < options.collapseThreshold ||
    relativeDrop > options.collapseDropRatio
  );

  const collapseReasons = [];
  if (generated.entropy.normalizedTraitEntropy < options.collapseThreshold) {
    collapseReasons.push(
      `normalized_trait_entropy=${generated.entropy.normalizedTraitEntropy} below threshold=${options.collapseThreshold}`
    );
  }
  if (relativeDrop > options.collapseDropRatio) {
    collapseReasons.push(
      `relative_drop=${round(relativeDrop, 4)} exceeds ratio=${options.collapseDropRatio}`
    );
  }

  return {
    infoGain,
    normalizedInfoGain,
    shapeInfoGain,
    relativeDrop: round(relativeDrop, 6),
    collapseFlag,
    collapseReasons: collapseReasons.length > 0 ? collapseReasons : null,
    verdict: collapseFlag
      ? 'COLLAPSE: self-play lost diversity relative to seed'
      : infoGain > 0
        ? 'GAIN: self-play added learnable information beyond seed'
        : infoGain === 0
          ? 'FLAT: self-play preserved seed diversity'
          : 'LOSS: self-play reduced diversity relative to seed',
  };
}

// ── Report builders ──────────────────────────────────────────────────────

function buildReport({ seed, generated, comparison, meta }) {
  return {
    schemaVersion: meta.schemaVersion,
    measuredAt: meta.measuredAt,
    collapseThreshold: meta.collapseThreshold,
    collapseDropRatio: meta.collapseDropRatio,
    seed: {
      inputPath: seed.inputPath,
      label: seed.label,
      iteration: seed.iteration,
      counts: seed.counts,
      entropy: seed.entropy,
    },
    generated: {
      inputPath: generated.inputPath,
      label: generated.label,
      iteration: generated.iteration,
      counts: generated.counts,
      entropy: generated.entropy,
    },
    comparison,
  };
}

function toMarkdown(report) {
  const s = report.seed;
  const g = report.generated;
  const c = report.comparison;
  const lines = [
    '# SESL Information-Gain Measurement',
    '',
    `**Schema:** \`${report.schemaVersion}\`  `,
    `**Measured at:** ${report.measuredAt}`,
    '',
    '## Seed corpus',
    '',
    `- Input: \`${s.inputPath}\``,
    `- Records: ${s.counts.totalRecords}`,
    `- Unique trait-family sets: ${s.counts.uniqueTraitSets}`,
    `- Unique composition shapes: ${s.counts.uniqueCompositionShapes}`,
    `- Trait-set entropy: ${s.entropy.traitSetEntropy} (max ${s.entropy.maxTraitEntropy}, normalized ${s.entropy.normalizedTraitEntropy})`,
    `- Composition-shape entropy: ${s.entropy.compositionShapeEntropy} (max ${s.entropy.maxShapeEntropy}, normalized ${s.entropy.normalizedShapeEntropy})`,
    `- Simpson diversity: ${s.entropy.simpsonDiversity}`,
    '',
    '## Generated corpus',
    '',
    `- Input: \`${g.inputPath}\``,
    `- Records: ${g.counts.totalRecords}`,
    `- Unique trait-family sets: ${g.counts.uniqueTraitSets}`,
    `- Unique composition shapes: ${g.counts.uniqueCompositionShapes}`,
    `- Trait-set entropy: ${g.entropy.traitSetEntropy} (max ${g.entropy.maxTraitEntropy}, normalized ${g.entropy.normalizedTraitEntropy})`,
    `- Composition-shape entropy: ${g.entropy.compositionShapeEntropy} (max ${g.entropy.maxShapeEntropy}, normalized ${g.entropy.normalizedShapeEntropy})`,
    `- Simpson diversity: ${g.entropy.simpsonDiversity}`,
    '',
    '## Comparison',
    '',
    `- **Information gain (trait-set entropy delta):** ${c.infoGain}`,
    `- **Normalized information gain:** ${c.normalizedInfoGain}`,
    `- **Shape information gain:** ${c.shapeInfoGain}`,
    `- **Relative entropy drop from seed:** ${c.relativeDrop}`,
    `- **Collapse threshold:** ${report.collapseThreshold}`,
    `- **Collapse drop ratio:** ${report.collapseDropRatio}`,
    `- **Collapse flag:** ${c.collapseFlag ? '**YES**' : 'no'}`,
  ];
  if (c.collapseReasons) {
    lines.push(`- **Collapse reasons:** ${c.collapseReasons.join('; ')}`);
  }
  lines.push(`- **Verdict:** ${c.verdict}`);
  return `${lines.join('\n')}\n`;
}

function round(value, places) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function failCli(message) {
  console.error(`[measure-sesl-information-gain] ${message}`);
  process.exit(1);
}
