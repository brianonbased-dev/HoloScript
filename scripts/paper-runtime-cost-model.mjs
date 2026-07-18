#!/usr/bin/env node
/**
 * Paper Runtime Cost Model
 *
 * Normalizes per-paper decoder/runtime cost evidence into one report shape:
 * asymptotic class + measured runtime/decoder overhead table + artifact paths.
 *
 * Run:
 *   node scripts/paper-runtime-cost-model.mjs --out docs/public/evidence/paper-runtime-cost-model.json
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const SCHEMA = 'holoscript.paper-runtime-cost-model.v1';

export function buildRuntimeCostModelReport(options = {}) {
  const root = resolve(options.root ?? REPO_ROOT);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const generatedRows = [
    buildPaper4Row(root),
    buildPaper6Row(root),
    buildPaper11Row(root),
    buildPaper12Row(root),
  ].filter(Boolean);
  const rows = mergeScopedRows(generatedRows, options.previousReport, options.paperIds);

  const reportBody = {
    schemaVersion: SCHEMA,
    generatedAt,
    generatedBy: 'scripts/paper-runtime-cost-model.mjs',
    summary: {
      rows: rows.length,
      measuredRows: rows.filter((row) => row.status === 'measured').length,
      paperStatusFlipCandidates: rows
        .filter((row) => row.paperStatusDecoderCostCandidate)
        .map((row) => row.paperId),
    },
    rows,
  };

  return {
    reportId: `runtime_cost_${sha256Canonical(reportBody).slice(0, 16)}`,
    reportHash: `sha256:${sha256Canonical(reportBody)}`,
    ...reportBody,
  };
}

function buildPaper4Row(root) {
  const artifact = 'docs/public/evidence/paper-4-sandbox-runtime-cost.json';
  const json = readJson(root, artifact);
  const full = json?.variants?.find((row) => row.id === 'full-sandbox');
  const baseline = json?.variants?.find((row) => row.id === 'unsandboxed');
  const fullThroughput = Number(full?.throughputOpsPerSecond);
  const baselineThroughput = Number(baseline?.throughputOpsPerSecond);
  const costModel = full?.costReceipt?.costModel;
  const asymptoticClass = json?.costModel?.asymptoticTime;
  if (
    !json ||
    !full ||
    !baseline ||
    !Number.isFinite(fullThroughput) ||
    fullThroughput <= 0 ||
    !Number.isFinite(baselineThroughput) ||
    baselineThroughput <= 0 ||
    costModel !== 'holoscript.plugin-sandbox.cost-model.v1' ||
    asymptoticClass !== 'O(C_vm(n) + a + b)' ||
    !isPaper4ReceiptValid(json, full, baseline)
  ) {
    return missingRow('4', 'Sandbox Contract', 'plugin sandbox enforcement', artifact);
  }

  return measuredRow({
    root,
    paperId: '4',
    paperTitle: 'Sandbox Contract',
    surface: 'plugin sandbox enforcement',
    asymptoticClass,
    asymptoticRationale:
      'C_vm(n) preserves Node/V8 compilation as an opaque function of n source-code units; enforcement adds constant-time checks for each guarded API-call event (a events total); execution is capped by b when resource limits are enabled.',
    inputScale:
      `${json.suite?.scenarioCount ?? 'unknown'} attack scenarios; ` +
      `${json.benchmark?.measuredIterations ?? 'unknown'} measured warm-cache iterations per variant; ` +
      `n=${full.costReceipt.sourceCodeUnits}, a=${full.costReceipt.guardedApiCalls}, ` +
      `b=${full.costReceipt.executionBudgetMs} ms`,
    baseline: metric('no-enforcement median', round6(1000 / baselineThroughput), 'ms/op'),
    measured: metric('full-sandbox median', round6(1000 / fullThroughput), 'ms/op'),
    artifact,
    harness: 'packages/core/src/plugins/__tests__/paper-sandbox-overhead.test.ts',
    interpretation:
      'Paper 4 runtime cost is derived from a matched full-sandbox versus no-enforcement warm-cache benchmark. The reported value excludes context creation and compilation, and the same artifact binds it to executable attack-suite behavior.',
    paperStatusDecoderCostCandidate: true,
    validation: {
      fullSandboxBlocked: Number(full.blocked),
      fullSandboxTotal: Number(full.total),
      noEnforcementBlocked: Number(baseline.blocked),
      noEnforcementTotal: Number(baseline.total),
      costModel,
      costVariables: json.costModel.variables,
      measuredReceipt: {
        sourceCodeUnits: Number(full.costReceipt.sourceCodeUnits),
        guardedApiCalls: Number(full.costReceipt.guardedApiCalls),
        executionBudgetMs: Number(full.costReceipt.executionBudgetMs),
        contextCreated: Boolean(full.costReceipt.contextCreated),
        scriptCompiled: Boolean(full.costReceipt.scriptCompiled),
      },
    },
  });
}

function isPaper4ReceiptValid(json, full, baseline) {
  const variables = json?.costModel?.variables;
  const receipt = full?.costReceipt;
  return (
    json?.schema === 'paper-sandbox-overhead.v1' &&
    variables?.n === 'sourceCodeUnits' &&
    variables?.a === 'guardedApiCalls' &&
    variables?.b === 'executionBudgetMs' &&
    Number(full?.total) > 0 &&
    Number(full?.blocked) === Number(full?.total) &&
    Number(baseline?.total) === Number(full?.total) &&
    Number(baseline?.blocked) === 0 &&
    Number.isFinite(Number(receipt?.sourceCodeUnits)) &&
    Number(receipt?.sourceCodeUnits) > 0 &&
    Number.isFinite(Number(receipt?.guardedApiCalls)) &&
    Number(receipt?.guardedApiCalls) > 0 &&
    Number.isFinite(Number(receipt?.executionBudgetMs)) &&
    Number(receipt?.executionBudgetMs) > 0 &&
    receipt?.contextCreated === false &&
    receipt?.scriptCompiled === false
  );
}

function mergeScopedRows(generatedRows, previousReport, paperIds) {
  if (!paperIds?.length) return generatedRows;

  const selected = new Set(paperIds.map(String));
  const generatedById = new Map(generatedRows.map((row) => [row.paperId, row]));
  const unknownIds = [...selected].filter((paperId) => !generatedById.has(paperId));
  if (unknownIds.length) {
    throw new Error(`Unknown paper id(s) for scoped runtime-cost update: ${unknownIds.join(', ')}`);
  }
  if (!Array.isArray(previousReport?.rows)) {
    throw new Error(
      'Scoped runtime-cost updates require a previous report to preserve other rows.'
    );
  }

  const seen = new Set();
  const merged = previousReport.rows.map((row) => {
    if (!selected.has(String(row.paperId))) return row;
    seen.add(String(row.paperId));
    return generatedById.get(String(row.paperId));
  });
  for (const paperId of selected) {
    if (!seen.has(paperId)) merged.push(generatedById.get(paperId));
  }
  return merged.sort((left, right) => Number(left.paperId) - Number(right.paperId));
}

export function writeRuntimeCostModelReport(report, outPath) {
  const target = resolve(outPath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return target;
}

export function renderMarkdownTable(report) {
  const lines = [
    '| Paper | Surface | Asymptotic class | Baseline | Measured | Overhead | Artifact |',
    '|---|---|---|---:|---:|---:|---|',
  ];
  for (const row of report.rows) {
    lines.push(
      `| ${row.paperId} ${row.paperTitle} | ${row.surface} | ${row.asymptoticClass} | ` +
        `${formatMetric(row.baseline)} | ${formatMetric(row.measured)} | ${formatOverhead(row)} | ` +
        `\`${row.artifacts[0] ?? 'missing'}\` |`
    );
  }
  return `${lines.join('\n')}\n`;
}

function buildPaper6Row(root) {
  const artifact = '.bench-logs/paper-6-ablation-publication.json';
  const json = readJson(root, artifact);
  if (!json) return missingRow('6', 'Verifiable Animation', 'retargeting solver runtime', artifact);

  const full = json.rows?.find((row) => row.variant === 'full-solver');
  const baseline = json.rows?.find((row) => row.variant === 'baseline-no-pipeline');
  if (!full || !baseline) {
    return missingRow('6', 'Verifiable Animation', 'retargeting solver runtime', artifact);
  }

  return measuredRow({
    root,
    paperId: '6',
    paperTitle: 'Verifiable Animation',
    surface: 'retargeting solver runtime',
    asymptoticClass: 'O(f * k)',
    asymptoticRationale:
      'Sampling f frames across k animation tracks; publication solver is a deterministic post-pass.',
    inputScale: `${json.frames} frames x ${json.iterations} iterations`,
    baseline: metric('baseline-no-pipeline', baseline.per_frame_us, 'us/frame'),
    measured: metric('full-solver', full.per_frame_us, 'us/frame'),
    artifact,
    harness: json.harness,
    interpretation:
      'Full solver runtime is the cost-bearing publication path; baseline lacks the solver and fails reference-hash equivalence.',
  });
}

function buildPaper11Row(root) {
  const semiringArtifact = '.bench-logs/paper-trait-semiring-overhead.json';
  const baselineArtifact = '.bench-logs/paper-trait-imperative-baseline.json';
  const semiring = readJson(root, semiringArtifact);
  const baseline = readJson(root, baselineArtifact);
  if (!semiring || !baseline) {
    return missingRow(
      '11',
      'HSPlus',
      'trait semiring resolution',
      semiringArtifact,
      baselineArtifact
    );
  }

  const batchSize = 100;
  const semiringRow = semiring.byBatchSize?.find((row) => row.batchSize === batchSize);
  const baselineRow = baseline.byBatchSize?.find((row) => row.batchSize === batchSize);
  if (!semiringRow || !baselineRow) {
    return missingRow(
      '11',
      'HSPlus',
      'trait semiring resolution',
      semiringArtifact,
      baselineArtifact
    );
  }

  return measuredRow({
    root,
    paperId: '11',
    paperTitle: 'HSPlus',
    surface: 'trait semiring resolution',
    asymptoticClass: 'O(t)',
    asymptoticRationale:
      'ProvenanceSemiring.add walks t trait applications once; the paired imperative baseline uses the same t.',
    inputScale: `${batchSize} trait applications; ${semiring.iterations} measured iterations`,
    baseline: metric('imperative direct write', baselineRow.perCallMedianUs, 'us/call'),
    measured: metric('ProvenanceSemiring.add', semiringRow.perCallMedianUs, 'us/call'),
    artifact: semiringArtifact,
    additionalArtifacts: [baselineArtifact],
    harness: 'packages/core/src/traits/constants/__tests__/paper-trait-semiring-overhead.test.ts',
    interpretation:
      'Paper 11 can cite this as a decoderCost flip candidate: the report has an explicit O(t) class and paired measured overhead against the uncontracted baseline.',
    paperStatusDecoderCostCandidate: true,
  });
}

function buildPaper12Row(root) {
  const artifact = '.bench-logs/2026-04-27-paper-12-scene-suite-overhead.md';
  const text = readText(root, artifact);
  const aggregate = text ? parsePaper12Aggregate(text) : undefined;
  if (!aggregate)
    return missingRow('12', 'HoloLand', 'scene-suite parser/export overhead', artifact);

  return measuredRow({
    root,
    paperId: '12',
    paperTitle: 'HoloLand',
    surface: 'scene-suite parser/export overhead',
    asymptoticClass: 'O(o * a)',
    asymptoticRationale:
      'The scene-suite parser/export path scales over o scene objects and a annotations/traits per object.',
    inputScale: '5-scene suite aggregate',
    baseline: metric('HoloScript warm parse mean', aggregate.warmParseMeanMs, 'ms'),
    measured: metric('OpenUSD plugin export mean', aggregate.usdExportMeanMs, 'ms'),
    artifact,
    harness:
      'packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts',
    interpretation:
      'Paper 12 has measured runtime/export overhead evidence; the paper still needs to cite it in a Runtime/Cost heading to flip decoderCost.',
    paperStatusDecoderCostCandidate: true,
  });
}

function measuredRow(input) {
  const overheadValue = Number((input.measured.value - input.baseline.value).toFixed(6));
  const overheadRatio =
    input.baseline.value === 0
      ? null
      : Number((input.measured.value / input.baseline.value).toFixed(4));
  const artifacts = [input.artifact, ...(input.additionalArtifacts ?? [])];
  return {
    paperId: input.paperId,
    paperTitle: input.paperTitle,
    status: 'measured',
    surface: input.surface,
    asymptoticClass: input.asymptoticClass,
    asymptoticRationale: input.asymptoticRationale,
    inputScale: input.inputScale,
    baseline: input.baseline,
    measured: input.measured,
    overhead: {
      label: `${input.measured.label} vs ${input.baseline.label}`,
      value: overheadValue,
      unit: input.measured.unit,
      ratio: overheadRatio,
    },
    artifacts,
    artifactHashes: artifacts.map((artifact) => ({
      path: artifact,
      sha256: hashFileIfPresent(resolve(input.root ?? REPO_ROOT, artifact)),
    })),
    harness: input.harness,
    interpretation: input.interpretation,
    paperStatusDecoderCostCandidate: Boolean(input.paperStatusDecoderCostCandidate),
    ...(input.validation ? { validation: input.validation } : {}),
  };
}

function missingRow(paperId, paperTitle, surface, ...artifacts) {
  return {
    paperId,
    paperTitle,
    status: 'missing-artifact',
    surface,
    asymptoticClass: 'unknown',
    asymptoticRationale: 'Cost model artifact was not found.',
    inputScale: 'unknown',
    baseline: metric('missing', 0, 'unknown'),
    measured: metric('missing', 0, 'unknown'),
    overhead: { label: 'missing', value: 0, unit: 'unknown', ratio: null },
    artifacts,
    artifactHashes: artifacts.map((artifact) => ({ path: artifact, sha256: null })),
    harness: 'missing',
    interpretation: 'Run the paper-specific benchmark before citing this row.',
    paperStatusDecoderCostCandidate: false,
  };
}

function parsePaper12Aggregate(markdown) {
  const lines = markdown.split(/\r?\n/);
  const warm = parseAggregateValue(lines, 'HoloScript warm parse (ms)');
  const usd = parseAggregateValue(lines, 'OpenUSD plugin export (ms)');
  if (!Number.isFinite(warm) || !Number.isFinite(usd)) return undefined;
  return {
    warmParseMeanMs: warm,
    usdExportMeanMs: usd,
  };
}

function parseAggregateValue(lines, label) {
  const line = lines.find((candidate) => candidate.includes(`| ${label} |`));
  if (!line) return Number.NaN;
  const cells = line
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean);
  return Number.parseFloat(cells[1]);
}

function metric(label, value, unit) {
  return { label, value: Number(value), unit };
}

function round6(value) {
  return Number(Number(value).toFixed(6));
}

function formatMetric(metricValue) {
  if (!Number.isFinite(metricValue.value)) return 'missing';
  return `${metricValue.value} ${metricValue.unit}`;
}

function formatOverhead(row) {
  const ratio = row.overhead.ratio == null ? 'n/a' : `${row.overhead.ratio}x`;
  return `${row.overhead.value} ${row.overhead.unit} (${ratio})`;
}

function readJson(root, relativePath) {
  const text = readText(root, relativePath);
  if (!text) return undefined;
  return JSON.parse(text);
}

function readText(root, relativePath) {
  const path = resolve(root, relativePath);
  return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
}

function hashFileIfPresent(path) {
  return existsSync(path)
    ? `sha256:${createHash('sha256').update(readFileSync(path)).digest('hex')}`
    : null;
}

function sha256Canonical(value) {
  return createHash('sha256')
    .update(JSON.stringify(sortForJson(value)))
    .digest('hex');
}

function sortForJson(value) {
  if (Array.isArray(value)) return value.map(sortForJson);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const key of Object.keys(value).sort()) {
    const child = value[key];
    if (child !== undefined) out[key] = sortForJson(child);
  }
  return out;
}

function parseArgs(argv) {
  const args = { paperIds: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--') continue;
    if (arg === '--help' || arg === '-h') args.help = true;
    else if (arg === '--out') args.out = argv[++i];
    else if (arg.startsWith('--out=')) args.out = arg.slice('--out='.length);
    else if (arg === '--generated-at') args.generatedAt = argv[++i];
    else if (arg.startsWith('--generated-at='))
      args.generatedAt = arg.slice('--generated-at='.length);
    else if (arg === '--paper') args.paperIds.push(argv[++i]);
    else if (arg.startsWith('--paper=')) args.paperIds.push(arg.slice('--paper='.length));
    else if (arg === '--base-ref') args.baseRef = argv[++i];
    else if (arg.startsWith('--base-ref=')) args.baseRef = arg.slice('--base-ref='.length);
    else if (arg === '--markdown') args.markdown = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function readPreviousReport(args) {
  if (!args.paperIds.length) return undefined;
  if (!args.out) throw new Error('Scoped runtime-cost updates require --out.');
  if (!args.baseRef) {
    if (!existsSync(resolve(args.out))) {
      throw new Error(
        'Scoped runtime-cost updates require an existing --out report or --base-ref.'
      );
    }
    return JSON.parse(readFileSync(resolve(args.out), 'utf8'));
  }

  const relativeOut = relative(REPO_ROOT, resolve(args.out)).replace(/\\/g, '/');
  if (relativeOut.startsWith('../') || relativeOut === '..') {
    throw new Error('--base-ref can only load reports inside the repository.');
  }
  const text = execFileSync('git', ['show', `${args.baseRef}:${relativeOut}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  return JSON.parse(text);
}

if (process.argv[1] && import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node scripts/paper-runtime-cost-model.mjs --out docs/public/evidence/paper-runtime-cost-model.json [--paper 4 --base-ref HEAD] [--markdown]'
    );
    process.exit(0);
  }
  const report = buildRuntimeCostModelReport({
    generatedAt: args.generatedAt,
    paperIds: args.paperIds,
    previousReport: readPreviousReport(args),
  });
  if (args.out) {
    const out = writeRuntimeCostModelReport(report, args.out);
    console.error(`[paper-runtime-cost-model] wrote ${out}`);
    console.error(`[paper-runtime-cost-model] ${report.reportId} ${report.reportHash}`);
  }
  if (args.markdown || !args.out) {
    console.log(renderMarkdownTable(report));
  }
}
