#!/usr/bin/env node
/**
 * Pure Node tests for scripts/paper-runtime-cost-model.mjs.
 *
 * Run via: `node scripts/__tests__/paper-runtime-cost-model.test.mjs`.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildRuntimeCostModelReport, renderMarkdownTable } from '../paper-runtime-cost-model.mjs';

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

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

function writeFixture(root) {
  const bench = join(root, '.bench-logs');
  mkdirSync(bench, { recursive: true });
  writeJson(join(root, 'docs/public/evidence/paper-4-sandbox-runtime-cost.json'), {
    schema: 'paper-sandbox-overhead.v1',
    benchmark: { warmupIterations: 10, measuredIterations: 300 },
    suite: { scenarioCount: 22 },
    costModel: {
      schema: 'holoscript.plugin-sandbox.cost-model.v1',
      asymptoticTime: 'O(C_vm(n) + a + b)',
      variables: {
        n: 'sourceCodeUnits',
        a: 'guardedApiCalls',
        b: 'executionBudgetMs',
      },
    },
    variants: [
      {
        id: 'full-sandbox',
        blocked: 22,
        total: 22,
        throughputOpsPerSecond: 500,
        costReceipt: {
          costModel: 'holoscript.plugin-sandbox.cost-model.v1',
          sourceCodeUnits: 25,
          guardedApiCalls: 1,
          executionBudgetMs: 5000,
          contextCreated: false,
          scriptCompiled: false,
        },
      },
      {
        id: 'unsandboxed',
        blocked: 0,
        total: 22,
        throughputOpsPerSecond: 1000,
        costReceipt: {
          costModel: 'holoscript.plugin-sandbox.cost-model.v1',
          sourceCodeUnits: 5,
          guardedApiCalls: 0,
          executionBudgetMs: null,
          contextCreated: false,
          scriptCompiled: false,
        },
      },
    ],
  });
  writeJson(join(bench, 'paper-6-ablation-publication.json'), {
    frames: 60,
    iterations: 1500,
    harness: 'packages/engine/src/animation/paper/benchmarks/p6-ablation-publication.ts',
    rows: [
      { variant: 'full-solver', per_frame_us: 10 },
      { variant: 'baseline-no-pipeline', per_frame_us: 4 },
    ],
  });
  writeJson(join(bench, 'paper-trait-semiring-overhead.json'), {
    iterations: 500,
    byBatchSize: [{ batchSize: 100, perCallMedianUs: 140 }],
  });
  writeJson(join(bench, 'paper-trait-imperative-baseline.json'), {
    iterations: 500,
    byBatchSize: [{ batchSize: 100, perCallMedianUs: 14 }],
  });
  writeFileSync(
    join(bench, '2026-04-27-paper-12-scene-suite-overhead.md'),
    [
      '| Metric | mean | median | p95 | max |',
      '|--------|------|--------|-----|-----|',
      '| HoloScript warm parse (ms) | 0.2 | 0.1 | 0.3 | 0.4 |',
      '| OpenUSD plugin export (ms) | 0.3 | 0.2 | 0.4 | 0.5 |',
    ].join('\n'),
    'utf8'
  );
}

const tmp = mkdtempSync(join(tmpdir(), 'paper-runtime-cost-model-'));
writeFixture(tmp);

const report = buildRuntimeCostModelReport({
  root: tmp,
  generatedAt: '2026-05-14T12:00:00.000Z',
});

assertEq(report.schemaVersion, 'holoscript.paper-runtime-cost-model.v1', 'schema version');
assertEq(report.summary.measuredRows, 4, 'all fixture rows measured');

const paper4 = report.rows.find((row) => row.paperId === '4');
assertOk(paper4?.paperStatusDecoderCostCandidate, 'paper 4 is a decoderCost flip candidate');
assertEq(paper4?.asymptoticClass, 'O(C_vm(n) + a + b)', 'paper 4 asymptotic class');
assertEq(paper4?.baseline.value, 1, 'paper 4 no-enforcement latency');
assertEq(paper4?.measured.value, 2, 'paper 4 full-sandbox latency');
assertEq(paper4?.overhead.ratio, 2, 'paper 4 latency overhead ratio');
assertEq(paper4?.validation.fullSandboxBlocked, 22, 'paper 4 full sandbox blocks suite');
assertEq(paper4?.validation.noEnforcementBlocked, 0, 'paper 4 baseline exposes suite');

const priorPaper6 = report.rows.find((row) => row.paperId === '6');
priorPaper6.baseline.value = 999;
const scopedReport = buildRuntimeCostModelReport({
  root: tmp,
  generatedAt: '2026-05-14T13:00:00.000Z',
  paperIds: ['4'],
  previousReport: report,
});
assertEq(
  scopedReport.rows.find((row) => row.paperId === '6')?.baseline.value,
  999,
  'scoped update preserves unselected paper rows'
);
assertEq(
  scopedReport.rows.find((row) => row.paperId === '4')?.baseline.value,
  1,
  'scoped update regenerates selected paper row'
);

const paper11 = report.rows.find((row) => row.paperId === '11');
assertOk(paper11?.paperStatusDecoderCostCandidate, 'paper 11 is a decoderCost flip candidate');
assertEq(paper11?.asymptoticClass, 'O(t)', 'paper 11 asymptotic class');
assertEq(paper11?.overhead.ratio, 10, 'paper 11 overhead ratio');

const paper12 = report.rows.find((row) => row.paperId === '12');
assertEq(paper12?.baseline.value, 0.2, 'paper 12 warm parse aggregate');
assertEq(paper12?.measured.value, 0.3, 'paper 12 USD export aggregate');

const table = renderMarkdownTable(report);
assertOk(
  table.includes('| 11 HSPlus | trait semiring resolution | O(t) |'),
  'markdown table includes paper 11'
);

if (testsFailed > 0) {
  console.error(`paper-runtime-cost-model tests failed: ${testsFailed}/${testsRun}`);
  process.exit(1);
}

console.log(`paper-runtime-cost-model tests passed: ${testsRun}/${testsRun}`);
