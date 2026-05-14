#!/usr/bin/env node
/**
 * Pure Node tests for scripts/paper-17-19-gate-delta.mjs.
 *
 * Run via: `node scripts/__tests__/paper-17-19-gate-delta.test.mjs`.
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGateDeltaReport, toMarkdown } from '../paper-17-19-gate-delta.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');

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

const report = buildGateDeltaReport({ repoRoot: REPO_ROOT });
const markdown = toMarkdown(report);

assertEq(report.schemaVersion, 'paper17_19.production_ml_corpus_gates.v1', 'schema version');
assertEq(report.paper17.counts.caelVerifiedPairs, 10, 'Paper 17 CAEL-verified tranche count');
assertEq(report.paper17.gate.gapCaelVerified, 4990, 'Paper 17 publication gate gap');
assertEq(report.paper17.gate.passRateOk, true, 'Paper 17 pass-rate gate is green');
assertEq(report.paper17.gate.volumeOk, false, 'Paper 17 volume gate remains open');

assertEq(report.paper19.dataset.rows, 7577, 'Paper 19 dataset row count');
assertEq(
  report.paper19.dataset.novelCombinationTestRows,
  306,
  'Paper 19 novel-combination test rows'
);
assertEq(report.paper19.structuralGates.rowsOk, true, 'Paper 19 row-count gate is green');
assertEq(
  report.paper19.structuralGates.novelCombinationOk,
  true,
  'Paper 19 novel-combination gate is green'
);
assertEq(report.paper19.structuralGates.synthRatioOk, true, 'Paper 19 synth-ratio gate is green');
assertEq(report.paper19.sourceIntegration.brittneyRows, 64, 'Paper 19 Brittney-origin rows');
assertEq(report.paper19.sourceIntegration.brittneyGap, 436, 'Paper 19 Brittney-origin gap');
assertEq(report.paper19.sourceIntegration.communityRows, 0, 'Paper 19 community-origin rows');
assertEq(report.paper19.sourceIntegration.communityGap, 500, 'Paper 19 community-origin gap');
assertEq(
  report.paper19.constrainedDecoderTraining.measurementPresent,
  false,
  'Paper 19 decoder evidence absent'
);

assertOk(
  markdown.includes('Machine summary (uAA2 COMPRESS)'),
  'markdown includes machine summary block'
);
assertOk(
  markdown.includes('Paper 17/19 Production ML Corpus Gates'),
  'markdown includes reviewer title'
);
assertOk(
  markdown.includes('| CAEL-verified pairs | 10 | 5000 | 4990 | no |'),
  'markdown includes Paper 17 table row'
);
assertOk(
  markdown.includes('| Brittney rows | 64 | 500 | 436 | no |'),
  'markdown includes Brittney gap row'
);

if (testsFailed > 0) {
  console.error(`paper-17-19-gate-delta tests failed: ${testsFailed}/${testsRun}`);
  process.exit(1);
}

console.log(`paper-17-19-gate-delta tests passed: ${testsRun}/${testsRun}`);
