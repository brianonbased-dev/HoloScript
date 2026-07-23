#!/usr/bin/env node

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createDeterministicZip } from '../holo-ci/lib/deterministic-zip.mjs';
import {
  sha256,
  validateSystemsPlatformBuilderContract,
  validateSystemsPlatformBuilderReceipt,
} from '../holo-ci/lib/systems-platform-builder-contract.mjs';
import { verifySystemsMacosBuilderBundle } from '../holo-ci/check-systems-0.3-macos-bundle.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const contract = JSON.parse(
  readFileSync(
    resolve(ROOT, 'scripts', 'holo-ci', 'systems-0.3-macos-builder-contract.json'),
    'utf8'
  )
);
const sourceCommit = '0123456789abcdef0123456789abcdef01234567';
const metaBytes = Buffer.from('deterministic-meta');
const platformBytes = Buffer.from('deterministic-platform');

function artifact(file, bytes) {
  return {
    file,
    bytes: bytes.length,
    sha256: sha256(bytes),
    deterministicRepackSha256: sha256(bytes),
  };
}

function fixture() {
  return {
    schema: 'holoscript.systems-compatible-builder-receipt/v1',
    generatedAt: '2026-07-23T00:00:00.000Z',
    ok: true,
    distributionId: contract.distributionId,
    releaseVersion: contract.releaseVersion,
    channel: contract.channel,
    machineContract: contract.machineContract,
    platform: contract.platform.id,
    sourceCommit,
    contractSha256: sha256(Buffer.from(`${JSON.stringify(contract, null, 2)}\n`)),
    source: { head: sourceCommit, cleanAtCommit: true, sourceDateEpoch: '1784764800' },
    builder: {
      kind: 'compatible-host',
      actualHost: contract.platform.id,
      os: contract.platform.os,
      arch: contract.platform.cpu,
      rustTarget: contract.platform.rustTarget,
    },
    baselinePlatformPackages: structuredClone(contract.baselinePlatformPackages),
    artifacts: {
      meta: artifact(contract.outputs.metaTarball, metaBytes),
      platform: artifact(contract.outputs.platformTarball, platformBytes),
    },
    proofs: {
      nativeCompile: {
        ok: true,
        entry: 'examples/native/multi-file-modules/entry.hs',
        exitCode: 5,
      },
      npmColdConsumer: {
        ok: true,
        repoLess: true,
        inputOrigin: 'packaged-conformance',
        exitCode: 5,
      },
    },
    postPublicationGate: structuredClone(contract.postPublicationGate),
    publicStateMutated: false,
  };
}

const contractResult = validateSystemsPlatformBuilderContract(contract);
assert.equal(contractResult.ok, true, contractResult.errors.join('; '));

const receipt = fixture();
const files = new Map([
  [contract.outputs.metaTarball, metaBytes],
  [contract.outputs.platformTarball, platformBytes],
]);
const receiptResult = validateSystemsPlatformBuilderReceipt(receipt, {
  contract,
  files,
  expectedSourceCommit: sourceCommit,
});
assert.equal(receiptResult.ok, true, receiptResult.errors.join('; '));

const receiptBytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
const bundle = createDeterministicZip([
  { name: contract.outputs.metaTarball, data: metaBytes },
  { name: contract.outputs.platformTarball, data: platformBytes },
  { name: contract.outputs.receipt, data: receiptBytes },
]);
const bundleResult = verifySystemsMacosBuilderBundle(bundle, {
  contract,
  expectedSourceCommit: sourceCommit,
});
assert.equal(bundleResult.ok, true, bundleResult.errors.join('; '));

const wrongHost = fixture();
wrongHost.builder.actualHost = 'linux-arm64';
assert.equal(
  validateSystemsPlatformBuilderReceipt(wrongHost, {
    contract,
    files,
    expectedSourceCommit: sourceCommit,
  }).ok,
  false
);

const proseOnlyColdProof = fixture();
proseOnlyColdProof.proofs.npmColdConsumer.exitCode = null;
assert.equal(
  validateSystemsPlatformBuilderReceipt(proseOnlyColdProof, {
    contract,
    files,
    expectedSourceCommit: sourceCommit,
  }).ok,
  false
);

const falsePublicClaim = fixture();
falsePublicClaim.postPublicationGate.satisfiedByBuilderBundle = true;
assert.equal(
  validateSystemsPlatformBuilderReceipt(falsePublicClaim, {
    contract,
    files,
    expectedSourceCommit: sourceCommit,
  }).ok,
  false
);

const driftedBundle = createDeterministicZip([
  { name: contract.outputs.metaTarball, data: Buffer.from('drift') },
  { name: contract.outputs.platformTarball, data: platformBytes },
  { name: contract.outputs.receipt, data: receiptBytes },
]);
assert.equal(
  verifySystemsMacosBuilderBundle(driftedBundle, {
    contract,
    expectedSourceCommit: sourceCommit,
  }).ok,
  false
);

const secretReceipt = fixture();
secretReceipt.builder.apiToken = 'must-not-land';
assert.equal(
  validateSystemsPlatformBuilderReceipt(secretReceipt, {
    contract,
    files,
    expectedSourceCommit: sourceCommit,
  }).ok,
  false
);

console.log('systems-platform-builder-contract.test.mjs PASS');
