#!/usr/bin/env node
/**
 * Verifies that package lane manifests agree with each other.
 *
 * This is the architecture guard above individual package checks:
 * - npm fleet-consumed packages must be v1 candidates.
 * - consumed npm/PyPI packages must be represented by at least one fleet utility.
 * - fleet utilities must point at packages that the consumption matrix owns.
 * - every v1 candidate must have a fleet-consumption row or a candidate
 *   repo-less consumption receipt row.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');
const rootIdx = args.indexOf('--root');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');

const MANIFESTS = {
  release: join(ROOT, 'scripts', 'holo-ci', 'npm-v1-release-manifest.json'),
  consumption: join(ROOT, 'scripts', 'holo-ci', 'package-consumption-manifest.json'),
  utilities: join(ROOT, 'scripts', 'holo-ci', 'fleet-utilities-manifest.json'),
  stewardship: join(ROOT, 'scripts', 'holo-ci', 'package-stewardship-manifest.json'),
};

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function names(items, key = 'name') {
  return new Set((items || []).map((item) => item?.[key]).filter(Boolean));
}

function sorted(set) {
  return [...set].sort();
}

function stewardByNpmPackage(stewardship) {
  return new Map(
    (stewardship?.packages || [])
      .filter((record) => record?.registry === 'npm' && record?.packageName)
      .map((record) => [record.packageName, record])
  );
}

function hasPublicApiCanary(record) {
  return (
    (record?.validationScripts || []).some((script) =>
      /^check:registry-cold-start:.+-public-api$/u.test(String(script || ''))
    ) ||
    (record?.validationCommands || []).some((command) => {
      const text = String(command || '');
      return (
        text.includes('check-registry-cold-start.mjs') && /--probe\s+\S+-public-api/u.test(text)
      );
    })
  );
}

function validateManifests({ release, consumption, utilities, stewardship }) {
  const errors = [];
  const warnings = [];

  if (release?.schema !== 'holoscript.npm-v1-release-readiness/v1') {
    errors.push(`unexpected release schema: ${release?.schema || '<missing>'}`);
  }
  if (consumption?.schema !== 'holoscript.package-consumption-matrix/v1') {
    errors.push(`unexpected consumption schema: ${consumption?.schema || '<missing>'}`);
  }
  if (utilities?.schema !== 'holoscript.fleet-utilities/v1') {
    errors.push(`unexpected utilities schema: ${utilities?.schema || '<missing>'}`);
  }
  if (stewardship?.schema !== 'holoscript.package-stewardship/v1') {
    errors.push(`unexpected stewardship schema: ${stewardship?.schema || '<missing>'}`);
  }

  const candidates = release?.candidatePackages || [];
  const candidateNames = names(candidates);
  const consumedNpm = names(consumption?.npmPackages);
  const candidateNpmReceipts = names(consumption?.candidateNpmPackages);
  const consumedPypi = names(consumption?.pypiPackages);
  const utilityNpm = names(utilities?.utilities, 'packageName');
  const utilityPypi = names(utilities?.utilities, 'pypiPackage');
  const npmStewards = stewardByNpmPackage(stewardship);

  for (const name of consumedNpm) {
    if (!candidateNames.has(name)) {
      errors.push(`${name}: fleet-consumed npm package is missing from npm v1 candidates`);
    }
    if (!utilityNpm.has(name)) {
      errors.push(`${name}: package-consumption entry has no fleet utility`);
    }
  }

  for (const name of candidateNpmReceipts) {
    if (!candidateNames.has(name)) {
      errors.push(`${name}: candidate consumption receipt is missing from npm v1 candidates`);
    }
    if (consumedNpm.has(name)) {
      errors.push(`${name}: package is duplicated across fleet and candidate consumption rows`);
    }
  }

  for (const name of consumedPypi) {
    if (!utilityPypi.has(name)) {
      errors.push(`${name}: PyPI consumption entry has no fleet utility`);
    }
  }

  for (const name of utilityNpm) {
    if (!consumedNpm.has(name)) {
      errors.push(`${name}: fleet utility packageName is not in package-consumption npmPackages`);
    }
  }

  for (const name of utilityPypi) {
    if (!consumedPypi.has(name)) {
      errors.push(`${name}: fleet utility pypiPackage is not in package-consumption pypiPackages`);
    }
  }

  for (const raw of candidates) {
    const candidate = typeof raw === 'string' ? { name: raw } : raw;
    if (!candidate.name) {
      errors.push('npm v1 candidate is missing name');
      continue;
    }
    if (consumedNpm.has(candidate.name) || candidateNpmReceipts.has(candidate.name)) continue;
    const steward = npmStewards.get(candidate.name);
    const stewardDetail =
      steward?.status === 'release-candidate' && hasPublicApiCanary(steward)
        ? ' (a public API canary exists but is not wired into the consumption matrix)'
        : '';
    errors.push(
      `${candidate.name}: npm v1 candidate has no fleet or candidate consumption receipt${stewardDetail}`
    );
  }

  return {
    ok: errors.length === 0,
    rows: {
      candidates: sorted(candidateNames),
      consumedNpm: sorted(consumedNpm),
      candidateNpmReceipts: sorted(candidateNpmReceipts),
      consumedPypi: sorted(consumedPypi),
      utilityNpm: sorted(utilityNpm),
      utilityPypi: sorted(utilityPypi),
    },
    warnings,
    errors,
  };
}

function runSelfTest() {
  const valid = validateManifests({
    release: {
      schema: 'holoscript.npm-v1-release-readiness/v1',
      candidatePackages: [
        { name: '@holoscript/core', role: 'language-core' },
        { name: '@holoscript/domain-plugin-template', role: 'domain-plugin-template' },
      ],
    },
    consumption: {
      schema: 'holoscript.package-consumption-matrix/v1',
      npmPackages: [{ name: '@holoscript/core' }],
      candidateNpmPackages: [{ name: '@holoscript/domain-plugin-template' }],
      pypiPackages: [{ name: 'holoscript' }],
    },
    utilities: {
      schema: 'holoscript.fleet-utilities/v1',
      utilities: [{ packageName: '@holoscript/core' }, { pypiPackage: 'holoscript' }],
    },
    stewardship: {
      schema: 'holoscript.package-stewardship/v1',
      packages: [
        {
          registry: 'npm',
          packageName: '@holoscript/core',
          status: 'fleet-operational',
        },
      ],
    },
  });
  if (!valid.ok) {
    throw new Error(`expected valid fixture to pass: ${valid.errors.join('; ')}`);
  }

  const invalid = validateManifests({
    release: {
      schema: 'holoscript.npm-v1-release-readiness/v1',
      candidatePackages: [{ name: '@holoscript/extra', role: 'language-core' }],
    },
    consumption: {
      schema: 'holoscript.package-consumption-matrix/v1',
      npmPackages: [{ name: '@holoscript/core' }],
      candidateNpmPackages: [],
      pypiPackages: [{ name: 'holoscript' }],
    },
    utilities: {
      schema: 'holoscript.fleet-utilities/v1',
      utilities: [{ packageName: '@holoscript/core' }],
    },
    stewardship: {
      schema: 'holoscript.package-stewardship/v1',
      packages: [
        {
          registry: 'npm',
          packageName: '@holoscript/extra',
          status: 'release-candidate',
        },
      ],
    },
  });
  if (invalid.ok || invalid.errors.length < 3) {
    throw new Error('expected invalid fixture to surface cross-manifest errors');
  }

  const publicApiReleaseCandidate = validateManifests({
    release: {
      schema: 'holoscript.npm-v1-release-readiness/v1',
      candidatePackages: [{ name: '@holoscript/engine', role: 'spatial-engine-runtime' }],
    },
    consumption: {
      schema: 'holoscript.package-consumption-matrix/v1',
      npmPackages: [],
      candidateNpmPackages: [{ name: '@holoscript/engine' }],
      pypiPackages: [],
    },
    utilities: {
      schema: 'holoscript.fleet-utilities/v1',
      utilities: [],
    },
    stewardship: {
      schema: 'holoscript.package-stewardship/v1',
      packages: [
        {
          registry: 'npm',
          packageName: '@holoscript/engine',
          status: 'release-candidate',
          validationScripts: ['check:registry-cold-start:engine-public-api'],
        },
      ],
    },
  });
  if (!publicApiReleaseCandidate.ok) {
    throw new Error(
      `expected public API release candidate to pass: ${publicApiReleaseCandidate.errors.join('; ')}`
    );
  }

  console.log('[package-architecture] self-test PASS');
}

function main() {
  if (SELF_TEST) {
    runSelfTest();
    return;
  }

  const missing = Object.entries(MANIFESTS).filter(([, path]) => !existsSync(path));
  if (missing.length) {
    const errors = missing.map(([name, path]) => `${name} manifest missing: ${path}`);
    console.error(`[package-architecture] FAIL: ${errors.length} issue(s)`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }

  const output = validateManifests({
    release: readJson(MANIFESTS.release),
    consumption: readJson(MANIFESTS.consumption),
    utilities: readJson(MANIFESTS.utilities),
    stewardship: readJson(MANIFESTS.stewardship),
  });

  if (JSON_OUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(`[package-architecture] npm v1 candidates: ${output.rows.candidates.join(', ')}`);
    console.log(`[package-architecture] consumed npm: ${output.rows.consumedNpm.join(', ')}`);
    console.log(`[package-architecture] consumed PyPI: ${output.rows.consumedPypi.join(', ')}`);
    for (const warning of output.warnings) console.warn(`[package-architecture] WARN: ${warning}`);
    if (output.errors.length) {
      console.error(`[package-architecture] FAIL: ${output.errors.length} issue(s)`);
      for (const error of output.errors) console.error(`  - ${error}`);
    } else {
      console.log('[package-architecture] PASS: package lane manifests are coherent.');
    }
  }

  process.exit(output.ok ? 0 : 1);
}

main();
