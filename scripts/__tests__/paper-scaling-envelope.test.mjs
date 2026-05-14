#!/usr/bin/env node
/**
 * Pure Node tests for scripts/paper-scaling-envelope.mjs.
 *
 * Run via: `node scripts/__tests__/paper-scaling-envelope.test.mjs`.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPaper12ScalingEnvelope,
  renderScalingMemo,
} from '../paper-scaling-envelope.mjs';

let testsRun = 0;
let testsFailed = 0;

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function assertOk(value, name) {
  testsRun += 1;
  if (value) console.log(`  PASS ${name}`);
  else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

const root = mkdtempSync(join(tmpdir(), 'paper-scaling-envelope-'));
const bench = join(root, '.bench-logs');
mkdirSync(bench, { recursive: true });
writeFileSync(
  join(bench, '2026-04-27-paper-12-scene-suite-overhead.md'),
  [
    '| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |',
    '|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|',
    '| large | 20 | 4 | 120 | 0.51 | 0.39 | 0.77 | 0.84 | 132 |',
    '| Metric | mean | median | p95 | max |',
    '|--------|------|--------|-----|-----|',
    '| HoloScript warm parse (ms) | 0.2 | 0.1 | 0.3 | 0.4 |',
    '| OpenUSD plugin export (ms) | 0.3 | 0.2 | 0.4 | 0.5 |',
  ].join('\n'),
  'utf8',
);

const envelope = buildPaper12ScalingEnvelope({
  root,
  generatedAt: '2026-05-14T12:45:00.000Z',
});

assertEq(envelope.schemaVersion, 'holoscript.paper-scaling-envelope.v1', 'schema version');
assertEq(envelope.bottleneckModel.asymptoticClass, 'O(o * a)', 'asymptotic class');
assertEq(envelope.measuredBaseline.peakScene.objects, 20, 'peak scene object count');
assertEq(envelope.growthModel.targets[0].objects, 50, 'first target object count');
assertEq(envelope.growthModel.targets[0].projectedRuntimeMs, 2.1, 'first runtime projection');
assertOk(renderScalingMemo(envelope).includes('research/paper-12-hololand-scaling.md'), 'memo citation path');

if (testsFailed > 0) {
  console.error(`paper-scaling-envelope tests failed: ${testsFailed}/${testsRun}`);
  process.exit(1);
}

console.log(`paper-scaling-envelope tests passed: ${testsRun}/${testsRun}`);
