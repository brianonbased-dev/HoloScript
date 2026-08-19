#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const script = join(repoRoot, 'scripts', 'holoshell-package-custody.mjs');

const fixtures = [
  {
    manager: 'winget',
    mutation: 'upgrade',
    packageId: 'BlenderFoundation.Blender',
    packageName: 'Blender',
    source: 'winget',
    publisher: 'Blender Foundation',
    from: '5.0.1',
    to: '5.1.1',
    commandNeedle: 'winget upgrade --id BlenderFoundation.Blender',
  },
  {
    manager: 'pnpm',
    mutation: 'upgrade',
    packageId: 'typescript',
    packageName: 'typescript',
    source: 'npm_registry',
    from: '5.8.0',
    to: '5.9.3',
    commandNeedle: 'pnpm update typescript --latest',
  },
  {
    manager: 'npm',
    mutation: 'install',
    packageId: '@holoscript/runtime',
    packageName: '@holoscript/runtime',
    source: 'npm_registry',
    from: 'none',
    to: 'latest',
    commandNeedle: 'npm install @holoscript/runtime',
  },
  {
    manager: 'msi',
    mutation: 'install',
    packageId: 'Vendor.Tool',
    packageName: 'Vendor Tool',
    source: 'local_installer',
    from: 'none',
    to: '1.0.0',
    installerHash: 'fixture-msi-sha256',
    commandNeedle: 'msiexec /i <local-msi-installer>',
  },
  {
    manager: 'exe',
    mutation: 'install',
    packageId: 'Vendor.Tool.Exe',
    packageName: 'Vendor Tool EXE',
    source: 'local_installer',
    from: 'none',
    to: '2.0.0',
    installerHash: 'fixture-exe-sha256',
    commandNeedle: '<local-exe-installer> /install',
  },
];

for (const fixture of fixtures) {
  const dir = mkdtempSync(join(tmpdir(), `holoshell-package-${fixture.manager}-`));
  const output = join(dir, 'latest.json');
  const jsOutput = join(dir, 'latest.js');
  const receiptDir = join(dir, 'receipts');
  const args = [
    script,
    '--manager', fixture.manager,
    '--mutation', fixture.mutation,
    '--package-id', fixture.packageId,
    '--package-name', fixture.packageName,
    '--source', fixture.source,
    '--current-version', fixture.from,
    '--available-version', fixture.to,
    '--output', output,
    '--js-output', jsOutput,
    '--receipt-dir', receiptDir,
    '--json',
  ];
  if (fixture.publisher) args.push('--publisher', fixture.publisher);
  if (fixture.installerHash) args.push('--installer-hash', fixture.installerHash);

  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
  });

  assert.equal(result.status, 0, `${fixture.manager} adapter should exit cleanly: ${result.stderr}`);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.schemaContract.status, 'valid', `${fixture.manager} receipt should validate`);
  assert.equal(receipt.adapterPlan.adapterId, `${fixture.manager}_dry_run_package_plan`);
  assert.equal(receipt.adapterPlan.dryRun, true);
  assert.equal(receipt.adapterPlan.execution.allowed, false);
  assert.equal(receipt.adapterPlan.execution.performed, false);
  assert.match(receipt.adapterPlan.execution.blockedReason, /never execute/);
  assert.equal(receipt.summary.executionAllowed, false);
  assert.equal(receipt.summary.mutationPerformed, false);
  assert.equal(receipt.mutationPerformed, false);
  assert.equal(receipt.approval.approvedCommandPreview, receipt.adapterPlan.commandPreview);
  assert.ok(receipt.adapterPlan.commandPreview.includes(fixture.commandNeedle));
  assert.equal(receipt.adapterPlan.preflight.network.status, receipt.preflight.networkStatus);
  assert.equal(receipt.adapterPlan.preflight.admin.session, receipt.preflight.adminSession);
  assert.equal(receipt.adapterPlan.preflight.process.conflictStatus, receipt.preflight.processConflictStatus);
  assert.equal(receipt.adapterPlan.preflight.packageManager.available, receipt.preflight.packageManagerAvailable);

  const written = JSON.parse(readFileSync(output, 'utf8'));
  assert.equal(written.hash, receipt.hash, `${fixture.manager} output receipt should match stdout`);
}

console.log(`PASS holoshell package custody dry-run adapters: ${fixtures.map((f) => f.manager).join(', ')}`);
