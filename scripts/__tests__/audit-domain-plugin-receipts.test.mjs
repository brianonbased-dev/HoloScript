#!/usr/bin/env node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { auditDomainPluginReceipts } from '../audit-domain-plugin-receipts.mjs';

let testsRun = 0;
let testsFailed = 0;

function assertOk(value, name) {
  testsRun += 1;
  if (value) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}`);
  }
}

function assertEq(actual, expected, name) {
  testsRun += 1;
  if (actual === expected) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function writePlugin(root, dirName, packageName, source) {
  const pluginDir = join(root, dirName);
  mkdirSync(join(pluginDir, 'src'), { recursive: true });
  writeFileSync(join(pluginDir, 'package.json'), JSON.stringify({ name: packageName }, null, 2));
  writeFileSync(join(pluginDir, 'src', 'index.ts'), source);
}

const tempRoot = mkdtempSync(join(tmpdir(), 'domain-plugin-receipts-'));
const pluginRoot = join(tempRoot, 'packages', 'plugins');

try {
  writePlugin(
    pluginRoot,
    'grid-with-receipt',
    '@fixture/grid-with-receipt',
    `
      export class DCPowerFlowSolver implements SimSolver {}
      export const RECEIPT_SCHEMA = 'fixture.energy-grid.receipt.v1';
      export function buildGridReceipt() {
        return { schema: RECEIPT_SCHEMA, cael: { version: 'cael.v1' }, acceptance: { accepted: true, violations: [] } };
      }
    `,
  );
  writePlugin(
    pluginRoot,
    'fabric-missing-receipt',
    '@fixture/fabric-missing-receipt',
    `
      export class FabricSimulationTrait {
        solve() { return 'cloth-state'; }
      }
    `,
  );
  writePlugin(
    pluginRoot,
    'shallow-domain',
    '@fixture/shallow-domain',
    `
      export const pluginMeta = { traits: ['catalog'] };
    `,
  );

  const audit = auditDomainPluginReceipts({
    repoRoot: tempRoot,
    pluginRoot,
    generatedAt: '2026-05-21T00:00:00.000Z',
  });
  const withReceipt = audit.rows.find((row) => row.packageName === '@fixture/grid-with-receipt');
  const missing = audit.rows.find((row) => row.packageName === '@fixture/fabric-missing-receipt');
  const shallow = audit.rows.find((row) => row.packageName === '@fixture/shallow-domain');

  assertEq(audit.schema, 'holoscript.domain-plugin-receipt-audit.v0.1.0', 'schema is stable');
  assertOk(withReceipt?.solverBacked, 'detects solver-backed receipt plugin');
  assertOk(withReceipt?.receiptBacked, 'detects receipt surface');
  assertOk(missing?.solverBacked, 'detects solver-backed missing plugin');
  assertEq(missing?.receiptBacked, false, 'missing plugin has no receipt');
  assertEq(missing?.recommendation, 'add-simulationcontract-receipt', 'missing plugin is actionable');
  assertEq(shallow?.solverBacked, false, 'shallow plugin is not treated as solver-backed');
  assertEq(audit.missingReceiptRows.length, 1, 'only one fixture gap is reported');
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (testsFailed > 0) {
  console.error(`\nFAIL ${testsFailed}/${testsRun} assertions failed`);
  process.exit(1);
}
console.log(`\nPASS ${testsRun} assertions`);
