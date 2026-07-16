#!/usr/bin/env node
/**
 * check:renderer-conformance — the forcing function for
 * `holoscript.native-renderer-contract.v1` (packages/runtime/src/native-renderer-contract.ts).
 *
 * Runs the renderer conformance suite
 * (packages/engine/src/native-render/__conformance__/renderer-conformance.test.ts),
 * which drives the contract's golden `.holo` scenes through BOTH engine
 * backends (WebGPUBackendRenderer native + ThreeJSRenderer bridge), derives a
 * capability-coverage matrix from auditable source evidence, and writes a
 * verified-view receipt to `.scratch/receipts/renderer-conformance.receipt.json`.
 *
 * EXIT 1 when a contract capability is implemented by the threejs bridge but
 * NOT by the native backend (bridge-only growth is frozen, W.830b), when the
 * suite fails, or when the receipt is missing/dishonest (a structural-mode
 * receipt carrying a frame hash is a fabrication and always fails).
 *
 * Registered in the root package.json check:* lane, same registration point as
 * check:render-surface-native. Uses the already-installed Vitest binary and the
 * engine package's own vitest config (which aliases @holoscript/core to source),
 * mirroring check-native-render-contract.mjs — no pnpm, no dist build required.
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const packageRoot = join(repoRoot, 'packages', 'engine');
const receiptPath = join(repoRoot, '.scratch', 'receipts', 'renderer-conformance.receipt.json');
const vitestBin = join(
  repoRoot,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'vitest.CMD' : 'vitest'
);

if (!existsSync(vitestBin)) {
  console.error(`[renderer-conformance] missing Vitest binary: ${vitestBin}`);
  process.exit(1);
}

const result = spawnSync(
  vitestBin,
  ['run', 'src/native-render/__conformance__/renderer-conformance.test.ts'],
  {
    cwd: packageRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (result.error) {
  console.error(`[renderer-conformance] failed to launch Vitest: ${result.error.message}`);
  process.exit(1);
}

if ((result.status ?? 1) !== 0) {
  console.error('[renderer-conformance] conformance suite failed — see Vitest output above.');
  process.exit(result.status ?? 1);
}

// The suite passed; re-verify the receipt it wrote (the receipt is the artifact
// downstream consumers read — the gate refuses to green without it).
if (!existsSync(receiptPath)) {
  console.error(`[renderer-conformance] suite passed but receipt is absent: ${receiptPath}`);
  process.exit(1);
}

let receipt;
try {
  receipt = JSON.parse(readFileSync(receiptPath, 'utf-8'));
} catch (error) {
  console.error(`[renderer-conformance] unreadable receipt: ${error.message}`);
  process.exit(1);
}

const failures = [];
if (receipt.schema !== 'holoscript.renderer-conformance-receipt.v1') {
  failures.push(`unexpected receipt schema: ${receipt.schema}`);
}
if (receipt.mode === 'structural' && receipt.frame?.frameHashes !== null) {
  failures.push('structural-mode receipt carries frame hashes — fabricated frame evidence');
}
const bridgeOnly = receipt.coverage?.bridgeOnlyCapabilities ?? null;
if (!Array.isArray(bridgeOnly)) {
  failures.push('receipt is missing coverage.bridgeOnlyCapabilities');
} else if (bridgeOnly.length > 0) {
  failures.push(
    `bridge-only capabilities (threejs bridge implements, native backend does not): ${bridgeOnly.join(', ')}`
  );
}

const matrix = receipt.coverage?.matrix ?? {};
console.log(`\n[renderer-conformance] mode=${receipt.mode} contract=${receipt.contractVersion}`);
console.log('[renderer-conformance] capability coverage (native | bridge):');
for (const [capability, sides] of Object.entries(matrix)) {
  const mark = (v) => (v ? 'yes' : 'no ');
  console.log(`    ${capability.padEnd(20)} ${mark(sides.native)} | ${mark(sides.bridge)}`);
}
if ((receipt.coverage?.missingEverywhere ?? []).length > 0) {
  console.log(
    `[renderer-conformance] contract debt (implemented by NEITHER backend at the renderer seam): ` +
      receipt.coverage.missingEverywhere.join(', ')
  );
}

if (failures.length > 0) {
  for (const failure of failures) console.error(`[renderer-conformance] FAIL: ${failure}`);
  process.exit(1);
}

console.log(`[renderer-conformance] OK — receipt: ${receiptPath}`);
process.exit(0);
