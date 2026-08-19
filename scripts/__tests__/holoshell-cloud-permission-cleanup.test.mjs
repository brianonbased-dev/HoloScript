import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const testRoot = path.join(repoRoot, '.tmp', 'holoshell', 'test-cloud-permission-cleanup');
const latest = path.join(testRoot, 'cloud-permission-cleanup-latest.json');
const latestJs = path.join(testRoot, 'cloud-permission-cleanup-latest.js');
const receiptDir = path.join(testRoot, 'receipts');
const googleExport = path.join(
  repoRoot,
  'scripts',
  '__tests__',
  'fixtures',
  'holoshell-google-drive-permissions.json'
);
const oneDriveExport = path.join(
  repoRoot,
  'scripts',
  '__tests__',
  'fixtures',
  'holoshell-onedrive-driveitems.json'
);

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  assert.equal(
    result.status,
    0,
    `${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
  );
  return result.stdout.trim() ? JSON.parse(result.stdout) : null;
}

function runNodeFailure(args) {
  return spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

rmSync(testRoot, { recursive: true, force: true });
mkdirSync(testRoot, { recursive: true });

const unsafeGoogleExport = path.join(testRoot, 'unsafe-google-drive-export.json');
writeFileSync(
  unsafeGoogleExport,
  JSON.stringify(
    {
      files: [
        {
          id: 'unsafe-file',
          name: 'Unsafe export',
          downloadUrl: 'https://provider.example/download?access_token=dummy-token',
          permissions: [],
        },
      ],
    },
    null,
    2
  ),
  'utf8'
);

runNode(['scripts/holoshell-cloud-permission-cleanup.mjs', '--self-test', '--json']);

const receipt = runNode([
  'scripts/holoshell-cloud-permission-cleanup.mjs',
  'verify',
  '--provider',
  'google_drive',
  '--account-label',
  'joseph@example.com',
  '--subject-receipt-id',
  'permission-subject-test',
  '--selected-item',
  'item-public-link,item-external-editor',
  '--approved-exposure',
  'item-public-link,item-external-editor',
  '--output',
  latest,
  '--js-output',
  latestJs,
  '--receipt-dir',
  receiptDir,
  '--json',
]);

assert.equal(receipt.workflow, 'cloud-drive-permission-cleanup');
assert.equal(receipt.status, 'clean');
assert.equal(receipt.inventory.provider, 'google_drive');
assert.equal(receipt.inventory.redactedAccountLabel, 'j***@example.com');
assert.equal(receipt.inventory.rawContentCaptured, false);
assert.equal(receipt.inventory.credentialExtrusionAllowed, false);
assert.equal(receipt.providerMetadataWitness.providerInputFormat, 'generic_items');
assert.equal(receipt.providerMetadataWitness.sourceKind, 'manual_fixture');
assert.equal(receipt.providerMetadataWitness.metadataOnly, true);
assert.equal(receipt.providerMetadataWitness.blockedFieldsAbsent, true);
assert.equal(receipt.inventory.providerMetadataWitnessReceiptId, receipt.providerMetadataWitness.id);
assert.deepEqual(receipt.exposureDiff.publicLinkItemIds, ['item-public-link']);
assert.deepEqual(receipt.exposureDiff.externalEditorItemIds, ['item-external-editor']);
assert.equal(receipt.revokePlan.permissionEnvelope, 'guarded_execute');
assert.equal(receipt.revokePlan.bulkMutationRequested, false);
assert.equal(receipt.revokePlan.deleteOrMoveRequested, false);
assert.equal(receipt.revokePlan.ownerTransferRequested, false);
assert.equal(receipt.verification.providerStateVerified, true);
assert.equal(receipt.verification.residualAccessCount, 0);
assert.equal(receipt.replay.readyToClaimClean, true);
assert.equal(receipt.replay.rawCredentialCaptured, false);
assert.equal(receipt.replay.hiddenAutomationUsed, false);
assert.ok(existsSync(latest));
assert.match(readFileSync(latestJs, 'utf8'), /HOLOSHELL_CLOUD_PERMISSION_CLEANUP/);
assert.ok(existsSync(path.join(repoRoot, receipt.output.receiptPath)));

const googleReceipt = runNode([
  'scripts/holoshell-cloud-permission-cleanup.mjs',
  'plan',
  '--provider',
  'google_drive',
  '--account-label',
  'owner@example.com',
  '--trusted-domain',
  'example.com',
  '--subject-receipt-id',
  'permission-subject-google-test',
  '--provider-export',
  googleExport,
  '--provider-format',
  'google_drive_permissions',
  '--output',
  path.join(testRoot, 'google-drive-latest.json'),
  '--js-output',
  path.join(testRoot, 'google-drive-latest.js'),
  '--receipt-dir',
  path.join(testRoot, 'google-drive-receipts'),
  '--json',
]);

assert.equal(googleReceipt.status, 'exposure_classified');
assert.equal(googleReceipt.inventory.provider, 'google_drive');
assert.equal(googleReceipt.providerMetadataWitness.provider, 'google_drive');
assert.equal(googleReceipt.providerMetadataWitness.providerInputFormat, 'google_drive_permissions');
assert.equal(googleReceipt.providerMetadataWitness.sourceKind, 'local_metadata_export');
assert.equal(googleReceipt.providerMetadataWitness.exportRecordCount, 3);
assert.equal(googleReceipt.providerMetadataWitness.metadataOnly, true);
assert.equal(googleReceipt.providerMetadataWitness.blockedFieldsAbsent, true);
assert.equal(
  googleReceipt.inventory.providerMetadataWitnessReceiptId,
  googleReceipt.providerMetadataWitness.id
);
assert.equal(googleReceipt.summary.providerInputFormat, 'google_drive_permissions');
assert.equal(googleReceipt.summary.providerMetadataWitnessId, googleReceipt.providerMetadataWitness.id);
assert.equal(googleReceipt.summary.providerExportMetadataOnly, true);
assert.equal(googleReceipt.summary.publicLinkCount, 1);
assert.equal(googleReceipt.summary.externalEditorCount, 1);
assert.equal(googleReceipt.summary.inheritedAccessCount, 1);
assert.equal(googleReceipt.inventory.items[0].subjects[0].boundary, 'public');
assert.equal(googleReceipt.inventory.items[1].subjects[0].redactedLabel, 'e***@external.example');
assert.equal(googleReceipt.inventory.items[1].subjects[0].role, 'editor');
assert.equal(googleReceipt.inventory.items[2].subjects[0].boundary, 'organization');
assert.equal(googleReceipt.replay.rawCredentialCaptured, false);

const oneDriveReceipt = runNode([
  'scripts/holoshell-cloud-permission-cleanup.mjs',
  'plan',
  '--provider',
  'onedrive',
  '--account-label',
  'owner@example.com',
  '--trusted-domain',
  'example.com',
  '--subject-receipt-id',
  'permission-subject-onedrive-test',
  '--provider-export',
  oneDriveExport,
  '--provider-format',
  'microsoft_graph_driveitems',
  '--output',
  path.join(testRoot, 'onedrive-latest.json'),
  '--js-output',
  path.join(testRoot, 'onedrive-latest.js'),
  '--receipt-dir',
  path.join(testRoot, 'onedrive-receipts'),
  '--json',
]);

assert.equal(oneDriveReceipt.status, 'exposure_classified');
assert.equal(oneDriveReceipt.inventory.provider, 'onedrive');
assert.equal(oneDriveReceipt.providerMetadataWitness.provider, 'onedrive');
assert.equal(oneDriveReceipt.providerMetadataWitness.providerInputFormat, 'microsoft_graph_driveitems');
assert.equal(oneDriveReceipt.providerMetadataWitness.exportRecordCount, 3);
assert.equal(oneDriveReceipt.providerMetadataWitness.metadataOnly, true);
assert.equal(oneDriveReceipt.summary.providerInputFormat, 'microsoft_graph_driveitems');
assert.equal(oneDriveReceipt.summary.publicLinkCount, 1);
assert.equal(oneDriveReceipt.summary.externalEditorCount, 1);
assert.equal(oneDriveReceipt.summary.inheritedAccessCount, 1);
assert.equal(oneDriveReceipt.inventory.items[0].subjects[0].boundary, 'public');
assert.equal(oneDriveReceipt.inventory.items[1].subjects[0].redactedLabel, 'd***@partner.example');
assert.equal(oneDriveReceipt.inventory.items[1].subjects[0].role, 'editor');
assert.equal(oneDriveReceipt.inventory.items[2].linkVisibility, 'domain');
assert.equal(oneDriveReceipt.replay.hiddenAutomationUsed, false);

assert.ok(
  existsSync(path.join(repoRoot, oneDriveReceipt.output.providerMetadataWitnessPath)),
  'provider metadata witness should be written beside the cleanup pack'
);

const unsafeResult = runNodeFailure([
  'scripts/holoshell-cloud-permission-cleanup.mjs',
  'plan',
  '--provider',
  'google_drive',
  '--account-label',
  'owner@example.com',
  '--provider-export',
  unsafeGoogleExport,
  '--provider-format',
  'google_drive_permissions',
  '--json',
]);
assert.notEqual(unsafeResult.status, 0, 'unsafe provider exports should fail validation');
assert.match(
  unsafeResult.stderr,
  /Provider metadata witness failed validation/,
  'unsafe provider export should fail at provider metadata witness validation'
);
assert.match(
  unsafeResult.stderr,
  /rawCredentialCaptured must be false/,
  'unsafe provider export should report raw credential capture'
);

console.log('holoshell cloud permission cleanup regression passed');
