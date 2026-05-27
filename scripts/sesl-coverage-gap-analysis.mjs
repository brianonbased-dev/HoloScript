/**
 * SESL 5000 coverage-gap analyzer — deterministic, no-spend.
 *
 * Reads a SESL phase-1 corpus JSONL and produces a structured breakdown
 * of why rows are ineligible, so the gap is actionable rather than
 * just a number.
 *
 * Usage:
 *   node scripts/sesl-coverage-gap-analysis.mjs --input research/paper-17-sesl-pairs/phase-1-corpus.jsonl
 *   node scripts/sesl-coverage-gap-analysis.mjs --input <path> --json
 *   node scripts/sesl-coverage-gap-analysis.mjs --input <path> --markdown --out gap.md
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TARGET = 5000;

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    input: null,
    format: 'json',
    out: null,
    target: DEFAULT_TARGET,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--input') {
      out.input = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--input=')) {
      out.input = arg.slice('--input='.length);
    } else if (arg === '--json') {
      out.format = 'json';
    } else if (arg === '--markdown' || arg === '--md') {
      out.format = 'markdown';
    } else if (arg === '--out') {
      out.out = argv[i + 1];
      i += 1;
    } else if (arg.startsWith('--out=')) {
      out.out = arg.slice('--out='.length);
    } else if (arg === '--target') {
      out.target = Number(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--target=')) {
      out.target = Number(arg.slice('--target='.length));
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node scripts/sesl-coverage-gap-analysis.mjs --input <jsonl> [--json|--markdown] [--out <path>] [--target <n>]`);
      process.exit(0);
    }
  }
  return out;
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

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

/** Detect rows that are verbatim duplicates or synthetic without diversity.
 *  shapeSeen tracks how many times each shape has already been processed.
 */
function isRewardHack(row, shapeCounts, shapeSeen) {
  const provenance = row.provenance || {};
  // Verbatim copies of existing rows
  if (provenance.kind === 'verbatim') return true;
  // Synthetic with no novel trait combination
  if (provenance.kind === 'synth' && !provenance.novel_combination) return true;
  // Duplicate composition shape (reward-hack by repetition)
  const shape = provenance.composition_shape_hash || row.composition_shape_hash;
  if (shape) {
    const seen = shapeSeen.get(shape) || 0;
    shapeSeen.set(shape, seen + 1);
    const total = shapeCounts.get(shape) || 1;
    // Allow up to 3 instances of any shape; mark extras as hack
    if (total > 3 && seen >= 3) return true;
  }
  return false;
}

/** True if the row has a valid CAEL trace. */
function hasValidTrace(row) {
  const trace = row.cael_trace;
  if (!trace) return false;
  if (!trace.hashChain?.valid && !trace.hash_chain_valid) return false;
  if ((trace.entryCount || 0) === 0) return false;
  return true;
}

/** True if the row passed the simulation contract. */
function passedContract(row) {
  const check = row.simContractCheck || row.sim_contract_check;
  if (!check) return false;
  return check.passed === true;
}

/** True if any solver was invoked (violations > 0 means solver ran and found issues). */
function solverInvoked(row) {
  const check = row.simContractCheck || row.sim_contract_check;
  if (!check) return false;
  // solverType present and not the null/unknown marker
  return typeof check.solverType === 'string' && check.solverType.length > 0;
}

export function analyzeCoverageGap(rows, options = {}) {
  const target = options.target || DEFAULT_TARGET;

  // Pre-scan: count shapes for duplicate detection
  const shapeCounts = new Map();
  for (const row of rows) {
    const shape =
      row.provenance?.composition_shape_hash || row.composition_shape_hash || 'unknown';
    shapeCounts.set(shape, (shapeCounts.get(shape) || 0) + 1);
  }

  let totalRows = 0;
  let rewardHackExcluded = 0;
  let noTraceRows = 0;
  let solverFailRows = 0;
  let staticOnlyRows = 0;
  let runtimeEligible = 0;

  const solverFailReasons = new Map(); // solverType -> { count, totalViolations }
  const familyRuntimeCounts = new Map(); // family -> { runtime: 0, static: 0 }
  const rowDigests = new Set();
  const shapeSeen = new Map();

  for (const row of rows) {
    totalRows += 1;

    // Exact duplicate detection
    const digest = sha256(JSON.stringify({ holo: row.holo, hsplus: row.hsplus, prompt: row.prompt_text }));
    if (rowDigests.has(digest)) {
      rewardHackExcluded += 1;
      continue;
    }
    rowDigests.add(digest);

    // Reward-hack exclusion
    if (isRewardHack(row, shapeCounts, shapeSeen)) {
      rewardHackExcluded += 1;
      continue;
    }

    // No valid trace
    if (!hasValidTrace(row)) {
      noTraceRows += 1;
      continue;
    }

    // Solver not invoked = static-only (no runtime coverage)
    if (!solverInvoked(row)) {
      staticOnlyRows += 1;
      const families = row.provenance?.trait_family_set || row.trait_family_set || [];
      for (const f of families) {
        const cur = familyRuntimeCounts.get(f) || { runtime: 0, static: 0 };
        cur.static += 1;
        familyRuntimeCounts.set(f, cur);
      }
      continue;
    }

    // Solver invoked but contract failed
    if (!passedContract(row)) {
      solverFailRows += 1;
      const check = row.simContractCheck || row.sim_contract_check;
      const solverType = check?.solverType || 'unknown';
      const cur = solverFailReasons.get(solverType) || { count: 0, totalViolations: 0 };
      cur.count += 1;
      cur.totalViolations += check?.violations || 0;
      solverFailReasons.set(solverType, cur);
      const families = row.provenance?.trait_family_set || row.trait_family_set || [];
      for (const f of families) {
        const fcur = familyRuntimeCounts.get(f) || { runtime: 0, static: 0 };
        fcur.runtime += 1;
        familyRuntimeCounts.set(f, fcur);
      }
      continue;
    }

    // Runtime eligible
    runtimeEligible += 1;
    const families = row.provenance?.trait_family_set || row.trait_family_set || [];
    for (const f of families) {
      const cur = familyRuntimeCounts.get(f) || { runtime: 0, static: 0 };
      cur.runtime += 1;
      familyRuntimeCounts.set(f, cur);
    }
  }

  // Identify static-only families: families with >0 rows but 0 runtime coverage
  const staticOnlyFamilies = [];
  for (const [family, counts] of familyRuntimeCounts) {
    if (counts.static > 0 && counts.runtime === 0) {
      staticOnlyFamilies.push(family);
    }
  }

  const gap = Math.max(0, target - runtimeEligible);

  return {
    schemaVersion: 'sesl.coverage_gap.v1',
    generatedAt: (options.now ? new Date(options.now) : new Date()).toISOString(),
    target,
    totalRows,
    rewardHackExcluded,
    noTraceRows,
    solverFailRows,
    staticOnlyRows,
    runtimeEligible,
    gap,
    solverFailReasons: Object.fromEntries(
      [...solverFailReasons].map(([k, v]) => [k, v]),
    ),
    staticOnlyFamilies,
    familyRuntimeCounts: Object.fromEntries(
      [...familyRuntimeCounts].map(([k, v]) => [k, v]),
    ),
    checks: {
      totalAddsUp:
        totalRows ===
        rewardHackExcluded + noTraceRows + solverFailRows + staticOnlyRows + runtimeEligible,
      gapCorrect: gap === Math.max(0, target - runtimeEligible),
    },
  };
}

export function toMarkdown(report) {
  const r = report;
  return `---
doc_tier: research
research_phase: base
status: active
canonical_for: sesl-coverage-gap-analysis
generatedAt: ${r.generatedAt}
---

# SESL Coverage Gap Analysis

**Target:** ${r.target.toLocaleString()} CAEL-verified pairs
**Runtime eligible:** ${r.runtimeEligible.toLocaleString()}
**Gap:** ${r.gap.toLocaleString()}

## Breakdown

| Category | Count | Share |
|---|---|---|
| Total rows read | ${r.totalRows.toLocaleString()} | 100% |
| Reward-hack exclusions | ${r.rewardHackExcluded.toLocaleString()} | ${((r.rewardHackExcluded / r.totalRows) * 100).toFixed(1)}% |
| No CAEL trace | ${r.noTraceRows.toLocaleString()} | ${((r.noTraceRows / r.totalRows) * 100).toFixed(1)}% |
| Static-only (no solver invoked) | ${r.staticOnlyRows.toLocaleString()} | ${((r.staticOnlyRows / r.totalRows) * 100).toFixed(1)}% |
| Solver failed | ${r.solverFailRows.toLocaleString()} | ${((r.solverFailRows / r.totalRows) * 100).toFixed(1)}% |
| **Runtime eligible** | **${r.runtimeEligible.toLocaleString()}** | **${((r.runtimeEligible / r.totalRows) * 100).toFixed(1)}%** |

## Solver-fail reasons

${Object.entries(r.solverFailReasons).length === 0 ? 'None.' : Object.entries(r.solverFailReasons)
  .map(([solver, data]) => `- **${solver}**: ${data.count} failures, ${data.totalViolations} total violations`)
  .join('\n')}

## Static-only families

${r.staticOnlyFamilies.length === 0 ? 'None.' : r.staticOnlyFamilies.map((f) => `- ${f}`).join('\n')}

## Integrity checks

- Totals add up: ${r.checks.totalAddsUp ? 'PASS' : 'FAIL'}
- Gap computation: ${r.checks.gapCorrect ? 'PASS' : 'FAIL'}
`;
}

function main() {
  const args = parseArgs();
  if (!args.input) {
    console.error('Error: --input <jsonl> is required');
    process.exit(1);
  }
  const rows = readJsonl(resolve(args.input));
  const report = analyzeCoverageGap(rows, { target: args.target });
  if (args.format === 'markdown') {
    const md = toMarkdown(report);
    if (args.out) {
      writeFileSync(resolve(args.out), md, 'utf8');
      console.log(`Markdown written to ${args.out}`);
    } else {
      console.log(md);
    }
  } else {
    const json = JSON.stringify(report, null, 2);
    if (args.out) {
      writeFileSync(resolve(args.out), json, 'utf8');
      console.log(`JSON written to ${args.out}`);
    } else {
      console.log(json);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
