import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeAuditSummaries,
  parseJsonFromText,
  summarizeAudit,
} from '../bounded-pnpm-audit.mjs';

test('parseJsonFromText extracts audit JSON from warning noise', () => {
  const parsed = parseJsonFromText('warning before\n{"metadata":{"vulnerabilities":{"moderate":1}}}\nwarning after');
  assert.equal(parsed.metadata.vulnerabilities.moderate, 1);
});

test('summarizeAudit returns parseable severity counts from metadata', () => {
  const summary = summarizeAudit(
    {
      advisories: {
        1: { severity: 'moderate' },
        2: { severity: 'high' },
      },
      metadata: {
        vulnerabilities: {
          info: 0,
          low: 2,
          moderate: 3,
          high: 4,
          critical: 1,
          total: 10,
        },
        dependencies: 42,
      },
    },
    'moderate'
  );

  assert.equal(summary.counts_available, true);
  assert.equal(summary.vulnerabilities.moderate, 3);
  assert.equal(summary.vulnerabilities.high, 4);
  assert.equal(summary.vulnerabilities.critical, 1);
  assert.equal(summary.vulnerabilities.blocking, 8);
  assert.equal(summary.vulnerabilities.total, 10);
  assert.equal(summary.advisory_count, 2);
  assert.equal(summary.dependency_count, 42);
});

test('summarizeAudit falls back to advisory severities when metadata is absent', () => {
  const summary = summarizeAudit(
    {
      advisories: {
        1: { severity: 'low' },
        2: { severity: 'moderate' },
        3: { severity: 'high' },
        4: { severity: 'critical' },
      },
    },
    'high'
  );

  assert.equal(summary.vulnerabilities.low, 1);
  assert.equal(summary.vulnerabilities.moderate, 1);
  assert.equal(summary.vulnerabilities.high, 1);
  assert.equal(summary.vulnerabilities.critical, 1);
  assert.equal(summary.vulnerabilities.blocking, 2);
});

test('mergeAuditSummaries keeps split prod/dev counts parseable', () => {
  const merged = mergeAuditSummaries(
    [
      summarizeAudit({ metadata: { vulnerabilities: { moderate: 2, high: 1, critical: 0 } } }, 'moderate'),
      summarizeAudit({ metadata: { vulnerabilities: { moderate: 1, high: 0, critical: 1 } } }, 'moderate'),
    ],
    'moderate'
  );

  assert.equal(merged.counts_available, true);
  assert.equal(merged.vulnerabilities.moderate, 3);
  assert.equal(merged.vulnerabilities.high, 1);
  assert.equal(merged.vulnerabilities.critical, 1);
  assert.equal(merged.vulnerabilities.blocking, 5);
});
