#!/usr/bin/env node

import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = mkdtempSync(join(tmpdir(), 'holoshell-download-recovery-'));
const shelf = join(root, 'shelf');
const receiptLog = join(root, 'team-automations', 'receipts.jsonl');

process.env.HOLOSHELL_DOWNLOAD_SHELF = shelf;
process.env.HOLOSHELL_TEAM_AUTOMATION_RECEIPTS = receiptLog;

mkdirSync(shelf, { recursive: true });
writeFileSync(
  join(shelf, 'alpha.json'),
  JSON.stringify({ id: 'alpha', status: 'interrupted', bytesReceived: 1024 }, null, 2)
);
writeFileSync(
  join(shelf, 'bravo.json'),
  JSON.stringify(
    {
      id: 'bravo',
      status: 'complete',
      integrityBadge: 'green',
      lastChunkHash: 'sha256:last-chunk',
    },
    null,
    2
  )
);

const runtimeUrl = `${pathToFileURL(resolve(__dirname, '../holoshell-download-recovery-runtime.mjs')).href}?test=${Date.now()}`;
const { callHoloshellDownloadRecoveryTool, holoshellDownloadRecoveryToolDefinitions } =
  await import(runtimeUrl);

const expectedNames = [
  'holoshell_download_recovery_list',
  'holoshell_download_recovery_resume',
  'holoshell_download_recovery_quarantine',
  'holoshell_download_recovery_forensic_export',
  'holoshell_download_recovery_import_handoff',
];

assert.deepEqual(
  holoshellDownloadRecoveryToolDefinitions.map((tool) => tool.name),
  expectedNames
);

const listed = await callHoloshellDownloadRecoveryTool('holoshell_download_recovery_list', {
  statusFilter: ['interrupted'],
});
assert.equal(listed.count, 1);
assert.equal(listed.receipts[0].id, 'alpha');

await assert.rejects(
  () => callHoloshellDownloadRecoveryTool('holoshell_download_recovery_resume', { id: 'alpha' }),
  /freshUserGesture=true/
);

const resumed = await callHoloshellDownloadRecoveryTool('holoshell_download_recovery_resume', {
  id: 'alpha',
  freshUserGesture: true,
  offset: 2048,
});
assert.equal(resumed.updatedShelfEntry.status, 'pending_consent');
assert.equal(resumed.resumeReceipt.offset, 2048);

const exported = await callHoloshellDownloadRecoveryTool(
  'holoshell_download_recovery_forensic_export',
  { id: 'alpha', includeFullTrace: true }
);
assert.equal(existsSync(exported.bundlePath), true);
assert.equal(exported.bundleHash.length, 64);

const handoff = await callHoloshellDownloadRecoveryTool(
  'holoshell_download_recovery_import_handoff',
  { id: 'bravo', freshUserGesture: true, targetShardOrAssetId: 'asset-1' }
);
assert.equal(handoff.updatedShelfEntry.status, 'handed_off');
assert.equal(handoff.handoffReceipt.targetShardOrAssetId, 'asset-1');

const receiptLines = readFileSync(receiptLog, 'utf8').trim().split(/\r?\n/);
assert.equal(receiptLines.length, 5);
for (const line of receiptLines) {
  const receipt = JSON.parse(line);
  assert.equal(receipt.schema, 'holoshell.download-recovery.receipt.v1');
  assert.deepEqual(receipt.holoGateStages, ['identify', 'scope', 'log']);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      tools: expectedNames.length,
      receiptLines: receiptLines.length,
    },
    null,
    2
  )
);
