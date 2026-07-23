#!/usr/bin/env node

import { ok as assertOk } from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  probeHostedCompanions,
  REQUIRED_GATE_IDS,
  validateSystemsPreviewRelease,
} from '../holo-ci/check-systems-preview-release.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const MANIFEST_PATH = resolve(ROOT, 'scripts', 'holo-ci', 'systems-preview-release-manifest.json');
const canonical = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
const localCoreVersion = JSON.parse(
  readFileSync(resolve(ROOT, 'packages', 'core', 'package.json'), 'utf8')
).version;

assertOk(canonical && typeof canonical === 'object', 'canonical release manifest must parse');

let testsRun = 0;
let testsFailed = 0;

function assert(condition, name, detail = '') {
  testsRun += 1;
  if (condition) {
    console.log(`  PASS ${name}`);
  } else {
    testsFailed += 1;
    console.error(`  FAIL ${name}${detail ? `: ${detail}` : ''}`);
  }
}

function validate(mutator = () => {}) {
  const fixture = structuredClone(canonical);
  mutator(fixture);
  return validateSystemsPreviewRelease(fixture, { rootDir: ROOT });
}

function hasError(result, pattern) {
  return result.errors.some((error) => pattern.test(error));
}

console.log('check-systems-preview-release.test.mjs');

{
  const result = validate();
  assert(
    result.ok,
    'canonical distribution contract is structurally valid',
    result.errors.join('; ')
  );
  assert(result.ready === true, 'canonical candidate is evidence-backed and ready');
  assert(
    result.blockingGateIds.length === canonical.releaseDecision.blockingGateIds.length,
    'computed blockers match the declared readiness decision'
  );
}

{
  const result = validate((manifest) => {
    manifest.releaseIdentity.registryPackage.name = '@holoscript/core';
  });
  assert(!result.ok, 'legacy npm identity collision fails');
  assert(
    hasError(result, /distribution package identity|collides with a legacy component/u),
    'collision diagnostic is explicit'
  );
}

{
  const result = validate((manifest) => {
    manifest.releaseIdentity.version = '8.0.16';
    manifest.releaseIdentity.registryPackage.version = '8.0.16';
  });
  assert(!result.ok, 'attempting to reuse a legacy-style version fails');
  assert(
    hasError(result, /first systems preview version must be 0\.1\.0/u),
    'first-version diagnostic is explicit'
  );
}

{
  const result = validate((manifest) => {
    manifest.components.find((component) => component.id === 'npm-core').version = '0.1.0';
  });
  assert(!result.ok, 'component pin drift fails');
  assert(
    result.errors.some((error) => error.includes(`does not match local ${localCoreVersion}`)),
    'component drift names the local version'
  );
}

{
  const result = validate((manifest) => {
    manifest.evidencePolicy.requireResolvableSourceCommit = false;
  });
  assert(!result.ok, 'release evidence policy cannot be weakened');
  assert(
    hasError(result, /evidencePolicy\.requireResolvableSourceCommit must be true/u),
    'weakened evidence policy diagnostic is explicit'
  );
}

{
  const result = validate((manifest) => {
    manifest.rails = manifest.rails.filter((rail) => rail.id !== 'native-windows-x64');
  });
  assert(!result.ok, 'missing native distribution rail fails');
  assert(
    hasError(result, /missing declared rail: native-windows-x64/u),
    'missing rail diagnostic is explicit'
  );
}

{
  const result = validate((manifest) => {
    delete manifest.candidateEvidence;
    for (const gate of manifest.gates) gate.status = 'pass';
    manifest.releaseDecision.blockingGateIds = [];
    manifest.releaseDecision.readyToPublish = true;
    manifest.releaseDecision.status = 'ready';
    manifest.releaseIdentity.registryPackage.publishState = 'candidate-built';
    for (const rail of manifest.rails) {
      if (rail.class === 'distribution') rail.artifactState = 'candidate-built';
    }
  });
  assert(!result.ok, 'ready release cannot rely on prose-only evidence');
  assert(
    hasError(result, /ready release must include candidateEvidence/u),
    'missing candidate evidence diagnostic is explicit'
  );
}

{
  const result = validate((manifest) => {
    manifest.candidateEvidence.receiptPaths[0] =
      'scripts/holo-ci/systems-preview-release-manifest.json';
  });
  assert(!result.ok, 'failed or non-receipt JSON cannot satisfy candidate evidence');
  assert(hasError(result, /receipt did not pass/u), 'non-passing receipt diagnostic is explicit');
}

{
  const result = validate((manifest) => {
    manifest.rails.find((rail) => rail.id === 'hosted-mcp').requiredForLocalCompile = true;
  });
  assert(!result.ok, 'hosted service cannot become a hidden local compiler dependency');
  assert(
    hasError(result, /hosted-mcp must explicitly remain unnecessary/u),
    'sovereignty diagnostic is explicit'
  );
}

{
  const result = validate((manifest) => {
    manifest.rails.find((rail) => rail.id === 'hosted-studio').identity =
      'https://studio.holoscript.net';
  });
  assert(!result.ok, 'hosted rail identity drift fails');
  assert(
    hasError(result, /hosted-studio: identity .* does not match Railway target/u),
    'hosted rail drift diagnostic names the Railway target'
  );
}

{
  const result = validate((manifest) => {
    manifest.gates = manifest.gates.filter((gate) => gate.id !== REQUIRED_GATE_IDS[0]);
  });
  assert(!result.ok, 'missing canonical readiness gate fails');
  assert(
    hasError(result, /missing required gate: named-consumer-boundary/u),
    'missing gate diagnostic is explicit'
  );
}

{
  const result = validate((manifest) => {
    const gate = manifest.gates.find((candidate) => candidate.id === 'cross-rail-parity');
    gate.status = 'partial';
    gate.remaining = 'Synthetic missing parity evidence.';
    manifest.releaseDecision.blockingGateIds = [];
    manifest.releaseDecision.readyToPublish = true;
    manifest.releaseDecision.status = 'ready';
  });
  assert(!result.ok, 'ready claim cannot override failing evidence gates');
  assert(
    hasError(result, /blockingGateIds must exactly match/u),
    'false-ready blocker mismatch is explicit'
  );
  assert(
    hasError(result, /readyToPublish must be false/u),
    'false-ready publication flag is explicit'
  );
}

{
  const result = validate((manifest) => {
    manifest.supportContract.accessToken = 'Bearer example-token-that-must-never-land';
  });
  assert(!result.ok, 'secret-shaped manifest fields fail');
  assert(hasError(result, /secret-shaped material/u), 'secret diagnostic is explicit');
}

{
  const seen = [];
  const versions = new Map([
    ['https://mcp.holoscript.net/health', '8.0.14'],
    ['https://absorb.holoscript.net/health', '6.1.1'],
  ]);
  const result = await probeHostedCompanions(canonical, {
    rootDir: ROOT,
    fetchImpl: async (url) => {
      seen.push(url);
      return {
        ok: true,
        status: 200,
        json: async () => (versions.has(url) ? { version: versions.get(url) } : { status: 'ok' }),
      };
    },
  });
  assert(result.ok, 'hosted companion readback accepts healthy declared targets');
  assert(seen.length === 3, 'hosted companion readback checks exactly three declared services');
  assert(
    seen.includes('https://studio-production-a071.up.railway.app/api/health'),
    'hosted companion readback uses the canonical Railway Studio endpoint'
  );
}

if (testsFailed > 0) {
  console.error(`\n${testsFailed}/${testsRun} tests failed`);
  process.exit(1);
}

console.log(`\n${testsRun}/${testsRun} tests passed`);
