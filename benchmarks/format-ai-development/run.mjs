#!/usr/bin/env node
/**
 * Benchmark HoloScript authoring formats on AI-development affordances.
 *
 * This is not a human-subject or LLM-quality benchmark. It measures the
 * deterministic substrate the stronger claim depends on:
 * - context cost: local BPE tokens, bytes, lines
 * - semantic surface: statically extractable objects, traits, state, behavior,
 *   services, contracts, and pipelines
 * - native-vs-handwritten compression where paired baselines exist
 */

import { encode } from 'gpt-tokenizer';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const DEFAULT_RESULT_DIR = path.join(
  DEFAULT_REPO_ROOT,
  'benchmarks',
  'format-ai-development',
  'results'
);
const SCHEMA = 'holoscript.format-ai-development-benchmark.v0.1.0';
const FORMAT_EXTENSIONS = new Set(['.holo', '.hsplus', '.hs']);
const BASELINE_EXTENSIONS = new Set(['.cs', '.cpp', '.h', '.ts', '.tsx', '.js', '.jsx']);
const IGNORE_DIRS = new Set([
  '.git',
  '.bench-logs',
  '.scratch',
  '.tmp',
  '.next',
  '.holo-persist',
  '.holoscript',
  'audit-results',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'target',
  'test-results',
  'tmp',
]);

function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(options.repo ?? DEFAULT_REPO_ROOT);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const outJson = path.resolve(
    options.out ?? path.join(DEFAULT_RESULT_DIR, 'latest-format-ai-development.json')
  );
  const outMarkdown = path.resolve(
    options.markdownOut ?? path.join(DEFAULT_RESULT_DIR, 'latest-format-ai-development.md')
  );

  const formatFiles = collectFiles(repoRoot, (file) => FORMAT_EXTENSIONS.has(path.extname(file)));
  const records = formatFiles.map((file) => analyzeFormatFile(repoRoot, file));
  const byFormat = summarizeByFormat(records);
  const baselineComparisons = findBaselineComparisons(repoRoot);
  const claimStatus = assessClaimStatus(byFormat, baselineComparisons);

  const result = {
    schema: SCHEMA,
    generatedAt,
    host: {
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      cpuCount: os.cpus().length,
    },
    repoRoot,
    corpus: {
      files: records.length,
      formats: Object.fromEntries(
        [...FORMAT_EXTENSIONS]
          .sort()
          .map((ext) => [ext.slice(1), records.filter((r) => r.format === ext.slice(1)).length])
      ),
      ignoredDirectories: [...IGNORE_DIRS].sort(),
    },
    summaryByFormat: byFormat,
    baselineComparisons,
    claimStatus,
    topSemanticDensity: records
      .slice()
      .sort(
        (a, b) => b.semantic.constructsPerThousandTokens - a.semantic.constructsPerThousandTokens
      )
      .slice(0, 15),
  };

  mkdirSync(path.dirname(outJson), { recursive: true });
  mkdirSync(path.dirname(outMarkdown), { recursive: true });
  writeFileSync(outJson, JSON.stringify(result, null, 2), 'utf8');
  writeFileSync(outMarkdown, renderMarkdown(result), 'utf8');

  printSummary(result, outJson, outMarkdown);
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--repo') options.repo = args[++i];
    else if (arg.startsWith('--repo=')) options.repo = arg.slice('--repo='.length);
    else if (arg === '--out') options.out = args[++i];
    else if (arg.startsWith('--out=')) options.out = arg.slice('--out='.length);
    else if (arg === '--markdown-out') options.markdownOut = args[++i];
    else if (arg.startsWith('--markdown-out=')) {
      options.markdownOut = arg.slice('--markdown-out='.length);
    } else if (arg === '--generated-at') {
      options.generatedAt = args[++i];
    } else if (arg.startsWith('--generated-at=')) {
      options.generatedAt = arg.slice('--generated-at='.length);
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        `Usage: node benchmarks/format-ai-development/run.mjs [--repo PATH] [--out PATH] [--markdown-out PATH]`
      );
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function collectFiles(root, predicate) {
  const out = [];
  walk(root, out, predicate);
  return out.sort((a, b) => a.localeCompare(b));
}

function walk(dir, out, predicate) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) walk(full, out, predicate);
      continue;
    }
    if (entry.isFile() && predicate(full)) out.push(full);
  }
}

function analyzeFormatFile(repoRoot, file) {
  const source = readFileSync(file, 'utf8');
  const format = path.extname(file).slice(1);
  const tokens = countTokens(source);
  const bytes = Buffer.byteLength(source, 'utf8');
  const lines = countLines(source);
  const constructs = extractConstructs(source, format);
  const constructCount = Object.values(constructs.counts).reduce((sum, n) => sum + n, 0);
  return {
    path: toPosix(path.relative(repoRoot, file)),
    format,
    lines,
    bytes,
    tokens,
    semantic: {
      constructCount,
      constructsPerThousandTokens: round(tokens > 0 ? (constructCount / tokens) * 1000 : 0, 2),
      uniqueTraits: constructs.uniqueTraits,
      counts: constructs.counts,
    },
  };
}

function extractConstructs(source, format) {
  const traitMatches = [...source.matchAll(/@([A-Za-z_][\w:-]*)/g)].map((m) => m[1]);
  const uniqueTraits = [...new Set(traitMatches)].sort();
  const counts = {
    traits: traitMatches.length,
    objects: matchCount(source, /\bobject\s+[A-Za-z_][\w-]*/g),
    templates: matchCount(source, /\btemplate\s+[A-Za-z_][\w-]*/g),
    stateBlocks: matchCount(source, /\bstate\s+[A-Za-z_][\w-]*\s*\{/g),
    behaviors: matchCount(source, /\bbehavior\b/g),
    actions: matchCount(source, /\baction\s+[A-Za-z_][\w-]*/g),
    events: matchCount(source, /\bon\s+["']?[\w:-]+/g),
    services: matchCount(source, /\bservice\s+[A-Za-z_][\w-]*/g),
    endpoints: matchCount(source, /@endpoint\b/g),
    contracts: matchCount(source, /@contract\b|\bcontract\s+[A-Za-z_][\w-]*/g),
    pipelines: format === 'hs' ? matchCount(source, /\bpipeline\s+[A-Za-z_"][\w\s-]*\{/g) : 0,
    pipelineSteps:
      format === 'hs'
        ? matchCount(source, /\b(source|transform|filter|sink)\s+[A-Za-z_"][\w\s-]*\{/g)
        : 0,
    platformBlocks: matchCount(source, /\bplatforms\s*:/g),
    metadataBlocks: matchCount(source, /\bmetadata\s*\{/g),
    environmentBlocks: matchCount(source, /\benvironment\s*\{/g),
  };
  return { uniqueTraits, counts };
}

function matchCount(source, regex) {
  return (source.match(regex) ?? []).length;
}

function summarizeByFormat(records) {
  const grouped = new Map();
  for (const record of records) {
    const arr = grouped.get(record.format) ?? [];
    arr.push(record);
    grouped.set(record.format, arr);
  }

  const summary = {};
  for (const format of [...grouped.keys()].sort()) {
    const rows = grouped.get(format);
    const totalTokens = sum(rows, (r) => r.tokens);
    const totalConstructs = sum(rows, (r) => r.semantic.constructCount);
    summary[format] = {
      files: rows.length,
      totalLines: sum(rows, (r) => r.lines),
      totalBytes: sum(rows, (r) => r.bytes),
      totalTokens,
      totalSemanticConstructs: totalConstructs,
      medianTokens: median(rows.map((r) => r.tokens)),
      medianLines: median(rows.map((r) => r.lines)),
      constructsPerThousandTokens: round(
        totalTokens > 0 ? (totalConstructs / totalTokens) * 1000 : 0,
        2
      ),
      avgUniqueTraitsPerFile: round(avg(rows.map((r) => r.semantic.uniqueTraits.length)), 2),
    };
  }
  return summary;
}

function findBaselineComparisons(repoRoot) {
  const scenariosDir = path.join(repoRoot, 'benchmarks', 'scenarios');
  if (!existsSync(scenariosDir)) return [];

  const comparisons = [];
  for (const scenario of readdirSync(scenariosDir, { withFileTypes: true })) {
    if (!scenario.isDirectory()) continue;
    const scenarioPath = path.join(scenariosDir, scenario.name);
    const nativeFiles = collectDirectFiles(scenarioPath, (file) =>
      FORMAT_EXTENSIONS.has(path.extname(file))
    );
    if (nativeFiles.length === 0) continue;

    const baselineDirs = readdirSync(scenarioPath, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory() && entry.name.includes('handwritten')
    );
    for (const baselineDir of baselineDirs) {
      const baselinePath = path.join(scenarioPath, baselineDir.name);
      const baselineFiles = collectFiles(baselinePath, (file) =>
        BASELINE_EXTENSIONS.has(path.extname(file))
      );
      if (baselineFiles.length === 0) continue;

      const nativeStats = summarizeFileSet(nativeFiles);
      const baselineStats = summarizeFileSet(baselineFiles);
      comparisons.push({
        scenario: scenario.name,
        nativeFiles: nativeFiles.map((file) => toPosix(path.relative(repoRoot, file))),
        baseline: baselineDir.name,
        baselineFiles: baselineFiles.map((file) => toPosix(path.relative(repoRoot, file))),
        native: nativeStats,
        handwritten: baselineStats,
        compression: {
          tokenRatio: round(ratio(baselineStats.tokens, nativeStats.tokens), 2),
          lineRatio: round(ratio(baselineStats.lines, nativeStats.lines), 2),
          byteRatio: round(ratio(baselineStats.bytes, nativeStats.bytes), 2),
        },
      });
    }
  }
  return comparisons.sort((a, b) =>
    `${a.scenario}/${a.baseline}`.localeCompare(`${b.scenario}/${b.baseline}`)
  );
}

function collectDirectFiles(dir, predicate) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(dir, entry.name))
    .filter(predicate)
    .sort((a, b) => a.localeCompare(b));
}

function summarizeFileSet(files) {
  const totals = { files: files.length, lines: 0, bytes: 0, tokens: 0 };
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    totals.lines += countLines(source);
    totals.bytes += Buffer.byteLength(source, 'utf8');
    totals.tokens += countTokens(source);
  }
  return totals;
}

function assessClaimStatus(byFormat, baselineComparisons) {
  const formatRows = Object.values(byFormat);
  const hasAllCoreFormats = ['holo', 'hsplus', 'hs'].every((format) => byFormat[format]?.files > 0);
  const totalConstructDensity = round(
    ratio(
      sum(formatRows, (row) => row.totalSemanticConstructs) * 1000,
      sum(formatRows, (row) => row.totalTokens)
    ),
    2
  );
  const bestCompression = baselineComparisons.reduce(
    (best, item) => Math.max(best, item.compression.tokenRatio),
    0
  );

  return {
    headline:
      hasAllCoreFormats && totalConstructDensity > 0 && bestCompression > 1
        ? 'format-level support, productivity claim still unproven'
        : 'insufficient format-level support',
    supportsNow: [
      'Local files contain machine-extractable structure per token.',
      'Native scene sources can be compared against handwritten platform baselines.',
      'The benchmark is reproducible without an LLM call or paid API.',
    ],
    stillNeeded: [
      'LLM task benchmark: prompt to valid artifact across .hs, .hsplus, .holo, TypeScript, and raw prose.',
      'Repair benchmark: broken artifact to validated artifact, measuring attempts, tokens, and wall time.',
      'Human study: time-to-first-valid scene or agent behavior with blinded tasks.',
    ],
    metrics: {
      hasAllCoreFormats,
      totalConstructsPerThousandTokens: totalConstructDensity,
      bestHandwrittenTokenCompressionRatio: round(bestCompression, 2),
    },
  };
}

function renderMarkdown(result) {
  const lines = [];
  lines.push('# HoloScript Format AI-Development Benchmark');
  lines.push('');
  lines.push(`Generated: ${result.generatedAt}`);
  lines.push(`Schema: \`${result.schema}\``);
  lines.push('');
  lines.push('## Claim Status');
  lines.push('');
  lines.push(`**${result.claimStatus.headline}**`);
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|---|---:|');
  lines.push(
    `| Core formats present | ${result.claimStatus.metrics.hasAllCoreFormats ? 'yes' : 'no'} |`
  );
  lines.push(
    `| Constructs / 1000 tokens | ${result.claimStatus.metrics.totalConstructsPerThousandTokens} |`
  );
  lines.push(
    `| Best handwritten token compression ratio | ${result.claimStatus.metrics.bestHandwrittenTokenCompressionRatio}x |`
  );
  lines.push('');
  lines.push('## Summary By Format');
  lines.push('');
  lines.push(
    '| Format | Files | Lines | Tokens | Constructs | Constructs / 1000 tokens | Avg unique traits/file |'
  );
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const [format, row] of Object.entries(result.summaryByFormat)) {
    lines.push(
      `| .${format} | ${row.files} | ${row.totalLines} | ${row.totalTokens} | ${row.totalSemanticConstructs} | ${row.constructsPerThousandTokens} | ${row.avgUniqueTraitsPerFile} |`
    );
  }
  lines.push('');
  lines.push('## Handwritten Baseline Compression');
  lines.push('');
  if (result.baselineComparisons.length === 0) {
    lines.push(
      'No paired handwritten baselines found under `benchmarks/scenarios/*/*handwritten*`.'
    );
  } else {
    lines.push(
      '| Scenario | Baseline | Native tokens | Handwritten tokens | Token ratio | Line ratio |'
    );
    lines.push('|---|---|---:|---:|---:|---:|');
    for (const row of result.baselineComparisons) {
      lines.push(
        `| ${row.scenario} | ${row.baseline} | ${row.native.tokens} | ${row.handwritten.tokens} | ${row.compression.tokenRatio}x | ${row.compression.lineRatio}x |`
      );
    }
  }
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  lines.push(
    '- This benchmark supports a narrow claim: HoloScript formats give agents dense, structured, machine-readable substrate compared with handwritten platform code where paired baselines exist.'
  );
  lines.push(
    '- It does not yet prove the broad claim that HoloScript changes AI development productivity. That requires LLM task, repair, and human workflow benchmarks.'
  );
  lines.push(
    '- The next benchmark should freeze tasks and compare `.holo`, `.hsplus`, `.hs`, TypeScript, and prose on valid-output rate, repair attempts, tokens spent, and wall time.'
  );
  lines.push('');
  lines.push('## Top Semantic-Density Files');
  lines.push('');
  lines.push('| File | Format | Tokens | Constructs / 1000 tokens | Unique traits |');
  lines.push('|---|---|---:|---:|---:|');
  for (const row of result.topSemanticDensity.slice(0, 10)) {
    lines.push(
      `| ${row.path} | .${row.format} | ${row.tokens} | ${row.semantic.constructsPerThousandTokens} | ${row.semantic.uniqueTraits.length} |`
    );
  }
  lines.push('');
  return lines.join('\n');
}

function printSummary(result, outJson, outMarkdown) {
  console.log('HoloScript format AI-development benchmark');
  console.log(`schema: ${result.schema}`);
  console.log(`files: ${result.corpus.files}`);
  for (const [format, row] of Object.entries(result.summaryByFormat)) {
    console.log(
      `.${format}: files=${row.files} tokens=${row.totalTokens} constructs=${row.totalSemanticConstructs} density=${row.constructsPerThousandTokens}/1k tok`
    );
  }
  for (const row of result.baselineComparisons) {
    console.log(
      `${row.scenario}/${row.baseline}: ${row.compression.tokenRatio}x fewer tokens than handwritten baseline`
    );
  }
  console.log(`claim: ${result.claimStatus.headline}`);
  console.log(`json: ${outJson}`);
  console.log(`markdown: ${outMarkdown}`);
}

function countTokens(source) {
  return encode(source).length;
}

function countLines(source) {
  if (source.length === 0) return 0;
  return source.split(/\r?\n/).length;
}

function sum(rows, fn) {
  return rows.reduce((total, row) => total + fn(row), 0);
}

function avg(values) {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function median(values) {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round((sorted[mid - 1] + sorted[mid]) / 2, 2) : sorted[mid];
}

function ratio(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function round(value, places = 2) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function toPosix(value) {
  return value.replace(/\\/g, '/');
}

main();
