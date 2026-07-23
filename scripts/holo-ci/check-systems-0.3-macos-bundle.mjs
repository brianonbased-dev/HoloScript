#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readDeterministicZip } from './lib/deterministic-zip.mjs';
import {
  validateSystemsPlatformBuilderContract,
  validateSystemsPlatformBuilderReceipt,
} from './lib/systems-platform-builder-contract.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONTRACT_PATH = resolve(
  ROOT,
  'scripts',
  'holo-ci',
  'systems-0.3-macos-builder-contract.json'
);

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

export function verifySystemsMacosBuilderBundle(
  bundleBytes,
  { contract, expectedSourceCommit } = {}
) {
  const errors = [...validateSystemsPlatformBuilderContract(contract).errors];
  let files;
  try {
    files = readDeterministicZip(bundleBytes);
  } catch (error) {
    return { ok: false, errors: [...errors, `invalid deterministic bundle: ${error.message}`] };
  }
  const expectedNames = [
    contract.outputs.metaTarball,
    contract.outputs.platformTarball,
    contract.outputs.receipt,
  ].sort();
  const actualNames = [...files.keys()].sort();
  if (JSON.stringify(actualNames) !== JSON.stringify(expectedNames)) {
    errors.push(
      `builder bundle entries mismatch: expected ${expectedNames.join(', ')}, found ${actualNames.join(', ')}`
    );
  }
  let receipt = null;
  try {
    receipt = JSON.parse(files.get(contract.outputs.receipt)?.toString('utf8') || '');
  } catch (error) {
    errors.push(`builder receipt is not valid JSON: ${error.message}`);
  }
  if (receipt) {
    errors.push(
      ...validateSystemsPlatformBuilderReceipt(receipt, {
        contract,
        files,
        expectedSourceCommit,
      }).errors
    );
  }
  return {
    ok: errors.length === 0,
    errors,
    sourceCommit: receipt?.sourceCommit || null,
    platform: receipt?.platform || null,
    artifacts: receipt?.artifacts || null,
    proofs: receipt?.proofs || null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const bundlePath = valueAfter(args, '--bundle');
  const expectedSourceCommit = valueAfter(args, '--source-commit') || undefined;
  if (!bundlePath || !existsSync(resolve(bundlePath))) {
    throw new Error('--bundle must name an existing deterministic builder bundle');
  }
  if (expectedSourceCommit && !/^[0-9a-f]{40}$/u.test(expectedSourceCommit)) {
    throw new Error('--source-commit must be a full 40-character Git commit');
  }
  const contract = JSON.parse(readFileSync(CONTRACT_PATH, 'utf8'));
  const result = verifySystemsMacosBuilderBundle(readFileSync(resolve(bundlePath)), {
    contract,
    expectedSourceCommit,
  });
  if (jsonOutput) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(
      `[systems-0.3-macos-bundle] ${result.ok ? 'PASS' : 'FAIL'} ${result.platform || 'unknown'}`
    );
    for (const error of result.errors) console.error(`  ${error}`);
  }
  if (!result.ok) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[systems-0.3-macos-bundle] ${error.message}`);
    process.exitCode = 1;
  });
}
