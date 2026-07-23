import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  lockfilePackageVersions,
  mergeAuditSummaries,
  parseJsonFromText,
  runBulkAdvisoryAudit,
  summarizeAudit,
  summarizeBulkAdvisories,
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

test('lockfilePackageVersions extracts resolved semver package keys only', () => {
  const inventory = lockfilePackageVersions(`
lockfileVersion: '9.0'

packages:

  '@scope/pkg@1.2.3':
    resolution: {integrity: sha512-test}

  sharp@0.35.3(@types/node@24.0.0):
    resolution: {integrity: sha512-test}

  sharp@0.34.5:
    resolution: {integrity: sha512-test}

  local-package@link:packages/local:
    resolution: {directory: packages/local}

snapshots:
`);

  assert.deepEqual(inventory.packages, {
    '@scope/pkg': ['1.2.3'],
    sharp: ['0.34.5', '0.35.3'],
  });
  assert.equal(inventory.packageCount, 2);
  assert.equal(inventory.versionCount, 3);
});

test('summarizeBulkAdvisories reports advisory severities without fake dependency counts', () => {
  const result = summarizeBulkAdvisories({
    sharp: [
      { id: 1, severity: 'high', title: 'libvips', url: 'https://example.test/1', vulnerable_versions: '<0.35.0' },
    ],
    tar: [
      { id: 2, severity: 'critical', title: 'tar', url: 'https://example.test/2', vulnerable_versions: '<8' },
      { id: 3, severity: 'moderate', title: 'tar 2', url: 'https://example.test/3', vulnerable_versions: '<8' },
    ],
  });

  assert.deepEqual(result.summary.vulnerabilities, {
    info: 0,
    low: 0,
    moderate: 1,
    high: 1,
    critical: 1,
    total: 3,
    blocking: 3,
  });
  assert.equal(result.summary.dependency_count, null);
  assert.equal(result.summary.source, 'npm-bulk-advisory');
  assert.equal(result.advisories.length, 3);
});

test('runBulkAdvisoryAudit sends the resolved lock inventory to the registry', async (context) => {
  const root = mkdtempSync(join(tmpdir(), 'holoscript-bulk-audit-'));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  const lockfilePath = join(root, 'pnpm-lock.yaml');
  writeFileSync(lockfilePath, `
lockfileVersion: '9.0'
packages:
  sharp@0.34.5:
    resolution: {integrity: sha512-test}
snapshots:
`);

  let request;
  const result = await runBulkAdvisoryAudit({
    auditLevel: 'moderate',
    fallbackTimeoutMs: 1000,
    lockfilePath,
    registry: 'https://registry.npmjs.org',
    scope: 'all',
  }, 1000, async (url, options) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        sharp: [{ id: 1124066, severity: 'high', vulnerable_versions: '<0.35.0' }],
      }),
    };
  });

  assert.equal(result.ok, true);
  assert.equal(result.packageCount, 1);
  assert.equal(result.versionCount, 1);
  assert.equal(result.summary.vulnerabilities.high, 1);
  assert.equal(request.url, 'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk');
  assert.deepEqual(JSON.parse(request.options.body), { sharp: ['0.34.5'] });
});
