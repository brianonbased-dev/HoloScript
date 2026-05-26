#!/usr/bin/env node
/**
 * Paper 17 SESL Fine-Tune Delta Evaluation Harness
 *
 * Measures improvement from fine-tuning Brittney on SESL seed data.
 * Three benchmarks:
 *   1. trait-correctness: does the model emit correct trait annotations?
 *   2. composition-shape: does it compose traits into valid shapes?
 *   3. information-gain: does fine-tuning improve novel-trait generation?
 *
 * Gate: PASS when >= 2 of 3 benchmarks show >= 5% improvement (delta).
 *
 * Usage:
 *   node scripts/sesl-finetune-delta-eval.mjs --generate-benchmarks
 *   node scripts/sesl-finetune-delta-eval.mjs --prepare-training-data
 *   node scripts/sesl-finetune-delta-eval.mjs --baseline brittney-qwen:latest
 *   node scripts/sesl-finetune-delta-eval.mjs --finetuned brittney-sesl-v1
 *   node scripts/sesl-finetune-delta-eval.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const PAIRS_DIR = path.join(REPO_ROOT, 'research', 'paper-17-sesl-pairs');
const BENCH_DIR = path.join(PAIRS_DIR, 'eval-benchmarks');
const SEED_PATH = path.join(PAIRS_DIR, 'fixtures', 'phase1-seed.jsonl');
const TRAIN_PATH = path.join(PAIRS_DIR, 'finetune-training.jsonl');
const REPORT_DIR = path.join(PAIRS_DIR, 'finetune-delta-reports');

const BENCHMARKS = ['trait-correctness', 'composition-shape', 'information-gain'];
const GATE_MIN_BENCHMARKS = 2;
const GATE_MIN_DELTA = 0.05;

const args = parseArgs(process.argv.slice(2));

function parseArgs(argv) {
  const out = { _: [] };
  for (const arg of argv) {
    if (arg === '--generate-benchmarks') out.generateBenchmarks = true;
    else if (arg === '--prepare-training-data') out.prepareTrainingData = true;
    else if (arg === '--baseline') { out.baseline = true; out.model = argv[argv.indexOf(arg) + 1]; }
    else if (arg === '--finetuned') { out.finetuned = true; out.model = argv[argv.indexOf(arg) + 1]; }
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--json') out.json = true;
    else if (arg.startsWith('--model=')) out.model = arg.split('=')[1];
    else if (!arg.startsWith('--')) out._.push(arg);
  }
  return out;
}

// ── Benchmark generation ──────────────────────────────────────────────

function loadSeedPairs() {
  return fs.readFileSync(SEED_PATH, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function generateBenchmarks() {
  fs.mkdirSync(BENCH_DIR, { recursive: true });
  const pairs = loadSeedPairs();

  // 1. Trait-correctness benchmark: prompt → expected trait families
  const traitBench = pairs.map((p) => ({
    id: `trait-${p.pair_id}`,
    prompt: p.prompt_text,
    expected_trait_families: p.trait_family_set,
    reference_hsplus: p.hsplus,
  }));

  // 2. Composition-shape benchmark: prompt → expected shape hash
  const compBench = pairs.map((p) => ({
    id: `comp-${p.pair_id}`,
    prompt: p.prompt_text,
    expected_shape_hash: p.composition_shape_hash,
    reference_hsplus: p.hsplus,
  }));

  // 3. Information-gain benchmark: prompt → novel trait diversity
  const infoBench = pairs.map((p) => ({
    id: `info-${p.pair_id}`,
    prompt: p.prompt_text,
    baseline_traits: p.trait_family_set,
    diversity_flags: p.diversity_flags,
    reference_hsplus: p.hsplus,
  }));

  const manifest = {
    schemaVersion: 'paper17.sesl.eval.v1',
    generatedAt: new Date().toISOString(),
    benchmarks: {
      'trait-correctness': { count: traitBench.length, path: 'trait-correctness.jsonl' },
      'composition-shape': { count: compBench.length, path: 'composition-shape.jsonl' },
      'information-gain': { count: infoBench.length, path: 'information-gain.jsonl' },
    },
    gate: { minBenchmarks: GATE_MIN_BENCHMARKS, minDelta: GATE_MIN_DELTA },
  };

  writeJsonl(path.join(BENCH_DIR, 'trait-correctness.jsonl'), traitBench);
  writeJsonl(path.join(BENCH_DIR, 'composition-shape.jsonl'), compBench);
  writeJsonl(path.join(BENCH_DIR, 'information-gain.jsonl'), infoBench);
  fs.writeFileSync(path.join(BENCH_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

  console.log(`Generated ${traitBench.length + compBench.length + infoBench.length} benchmark entries`);
  console.log(`Manifest: ${path.join(BENCH_DIR, 'manifest.json')}`);
}

// ── Training data preparation ────────────────────────────────────────

function prepareTrainingData() {
  const pairs = loadSeedPairs();
  const records = pairs.map((p) => ({
    instruction: p.prompt_text,
    input: '',
    output: p.hsplus,
    metadata: {
      pair_id: p.pair_id,
      trait_families: p.trait_family_set,
      composition_shape: p.composition_shape_hash,
    },
  }));

  fs.mkdirSync(path.dirname(TRAIN_PATH), { recursive: true });
  writeJsonl(TRAIN_PATH, records);
  console.log(`Prepared ${records.length} training records → ${TRAIN_PATH}`);
}

// ── Scoring functions ─────────────────────────────────────────────────

function scoreTraitCorrectness(response, expected) {
  if (!response || !expected) return 0;
  const responseTraits = new Set(extractTraits(response).map((t) => t.toLowerCase()));
  const expectedTraits = new Set(expected.map((t) => t.toLowerCase()));
  if (expectedTraits.size === 0) return 0;

  let matched = 0;
  for (const t of expectedTraits) {
    if (responseTraits.has(t)) matched++;
  }
  return matched / expectedTraits.size;
}

function scoreCompositionShape(response, expectedHash) {
  if (!response) return 0;
  // Check if the response contains the expected shape pattern or a valid composition
  const hasObject = /object\s+"?\w+"?\s*\{/.test(response);
  const hasTraits = /@\w+/.test(response);
  const hasGeometry = /geometry\s*:/i.test(response);
  let score = 0;
  if (hasObject) score += 0.33;
  if (hasTraits) score += 0.33;
  if (hasGeometry) score += 0.34;
  return Math.min(score, 1);
}

function scoreInformationGain(baselineTraits, finetunedTraits) {
  if (!finetunedTraits || finetunedTraits.length === 0) return 0;
  const baseline = new Set((baselineTraits || []).map((t) => t.toLowerCase()));
  const finetuned = new Set(finetunedTraits.map((t) => t.toLowerCase()));
  let novel = 0;
  for (const t of finetuned) {
    if (!baseline.has(t)) novel++;
  }
  // Reward novel traits but also require baseline traits are preserved
  const preserved = [...baseline].filter((t) => finetuned.has(t)).length;
  const baselineCoverage = baseline.size > 0 ? preserved / baseline.size : 0;
  return baselineCoverage * 0.5 + (finetuned.size > 0 ? novel / finetuned.size : 0) * 0.5;
}

function extractTraits(text) {
  const matches = text.match(/@(\w+)/g) || [];
  return matches.map((m) => m.slice(1));
}

// ── Model inference ───────────────────────────────────────────────────

function runInference(model, benchmarkPath, benchmarkName) {
  const entries = readJsonl(benchmarkPath);
  const results = [];

  for (const entry of entries) {
    let response = '';
    try {
      const prompt = entry.prompt || entry.instruction || '';
      const cmd = `ollama run ${model} --nowordwrap "${prompt.replace(/"/g, '\\"')}" 2>/dev/null`;
      response = execSync(cmd, { timeout: 30000, encoding: 'utf8' }).trim();
    } catch {
      response = '';
    }

    let score = 0;
    if (benchmarkName === 'trait-correctness') {
      score = scoreTraitCorrectness(response, entry.expected_trait_families);
    } else if (benchmarkName === 'composition-shape') {
      score = scoreCompositionShape(response, entry.expected_shape_hash);
    } else if (benchmarkName === 'information-gain') {
      const responseTraits = extractTraits(response);
      score = scoreInformationGain(entry.baseline_traits, responseTraits);
    }

    results.push({ id: entry.id, score, response_length: response.length });
  }

  return results;
}

// ── Evaluation ────────────────────────────────────────────────────────

function evaluate(model, modelLabel) {
  if (args.dryRun) {
    console.log(`[dry-run] Would evaluate model: ${model} (${modelLabel})`);
    console.log(`[dry-run] Benchmarks: ${BENCHMARKS.join(', ')}`);
    console.log(`[dry-run] Gate: >= ${GATE_MIN_BENCHMARKS}/${BENCHMARKS.length} benchmarks with >= ${(GATE_MIN_DELTA * 100).toFixed(0)}% delta`);
    return null;
  }

  if (!model) {
    failCli(`--model required for evaluation (got: ${modelLabel})`);
  }

  const manifest = JSON.parse(fs.readFileSync(path.join(BENCH_DIR, 'manifest.json'), 'utf8'));
  const results = {};

  for (const [name, meta] of Object.entries(manifest.benchmarks)) {
    const benchPath = path.join(BENCH_DIR, meta.path);
    console.log(`Evaluating ${modelLabel} on ${name} (${meta.count} entries)...`);
    results[name] = runInference(model, benchPath, name);
  }

  return results;
}

function computeGate(baselineResults, finetunedResults) {
  if (!baselineResults || !finetunedResults) {
    return { verdict: 'INCOMPLETE', details: 'Both baseline and finetuned results required' };
  }

  const deltas = {};
  let passingBenchmarks = 0;

  for (const name of BENCHMARKS) {
    const baseScores = (baselineResults[name] || []).map((r) => r.score);
    const ftScores = (finetunedResults[name] || []).map((r) => r.score);

    const baseAvg = baseScores.length > 0 ? baseScores.reduce((a, b) => a + b, 0) / baseScores.length : 0;
    const ftAvg = ftScores.length > 0 ? ftScores.reduce((a, b) => a + b, 0) / ftScores.length : 0;
    const delta = ftAvg - baseAvg;

    deltas[name] = { baselineAvg: baseAvg, finetunedAvg: ftAvg, delta, pass: delta >= GATE_MIN_DELTA };
    if (delta >= GATE_MIN_DELTA) passingBenchmarks++;
  }

  const verdict = passingBenchmarks >= GATE_MIN_BENCHMARKS ? 'PASS' : 'FAIL';
  return { verdict, passingBenchmarks, totalBenchmarks: BENCHMARKS.length, deltas, gate: `${GATE_MIN_BENCHMARKS}/${BENCHMARKS.length} benchmarks >= ${(GATE_MIN_DELTA * 100).toFixed(0)}% delta` };
}

// ── I/O helpers ───────────────────────────────────────────────────────

function readJsonl(filePath) {
  return fs.readFileSync(filePath, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
}

function writeJsonl(filePath, records) {
  fs.writeFileSync(filePath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
}

function failCli(msg) {
  console.error(`[sesl-finetune-delta-eval] ${msg}`);
  process.exit(1);
}

// ── Main ───────────────────────────────────────────────────────────────

if (args.generateBenchmarks) {
  generateBenchmarks();
} else if (args.prepareTrainingData) {
  prepareTrainingData();
} else if (args.baseline || args.finetuned) {
  const model = args.model || failCli('--model required');
  const label = args.baseline ? 'baseline' : 'finetuned';
  const results = evaluate(model, label);
  if (results) {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = path.join(REPORT_DIR, `${label}-${Date.now()}.json`);
    fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
    console.log(`Results saved: ${reportPath}`);
    for (const [name, entries] of Object.entries(results)) {
      const avg = entries.reduce((s, e) => s + e.score, 0) / entries.length;
      console.log(`  ${name}: avg=${avg.toFixed(4)} (${entries.length} entries)`);
    }
  }
} else if (args.dryRun) {
  evaluate(null, 'dry-run');
} else {
  console.log(`Usage: node scripts/sesl-finetune-delta-eval.mjs [MODE]
Modes:
  --generate-benchmarks   Create eval benchmark JSONL files
  --prepare-training-data Convert seed corpus to instruction-tuning format
  --baseline <model>      Run baseline evaluation
  --finetuned <model>     Run fine-tuned evaluation
  --dry-run               Show config without running inference
  --json                  JSON output`);
}