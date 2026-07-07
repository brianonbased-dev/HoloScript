#!/usr/bin/env node
/**
 * Validates the package stewardship map that tells agents how to foster public
 * npm/PyPI packages as construction surfaces for humans and AI agents.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const SELF_TEST = args.includes('--self-test');
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'package-stewardship-manifest.json');

const FLEET_MANIFEST = join(ROOT, 'scripts', 'holo-ci', 'fleet-utilities-manifest.json');
const CONSUMPTION_MANIFEST = join(ROOT, 'scripts', 'holo-ci', 'package-consumption-manifest.json');
const RELEASE_MANIFEST = join(ROOT, 'scripts', 'holo-ci', 'npm-v1-release-manifest.json');
const ROOT_PACKAGE = join(ROOT, 'package.json');
const WORKSPACE_ROOTS = ['packages', 'services', 'benchmarks'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo', '.git']);
const KNOWN_REGISTRIES = new Set(['npm', 'pypi']);
const KNOWN_STATUSES = new Set([
  'fleet-operational',
  'release-candidate',
  'incubating',
  'parked',
]);
const REQUIRED_USER_CLASSES = new Set(['human', 'ai-agent']);

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/u, ''));
}

function packageKey(registry, name) {
  return `${registry}:${name}`;
}

function recordName(record) {
  return record.registry === 'npm' ? record.packageName : record.pypiPackage;
}

function recordKey(record) {
  return packageKey(record.registry, recordName(record));
}

function addToMapSet(map, key, value) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(value);
}

function discoverPackageJsons(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const manifest = join(full, 'package.json');
      if (existsSync(manifest)) out.push(manifest);
      discoverPackageJsons(full, out);
    }
  }
  return out;
}

function workspacePackageNames(root) {
  const out = new Set();
  for (const workspaceRoot of WORKSPACE_ROOTS) {
    for (const manifest of discoverPackageJsons(join(root, workspaceRoot))) {
      const pkg = readJson(manifest);
      if (pkg.name) out.add(pkg.name);
    }
  }
  return out;
}

function contextFromFiles(root) {
  const fleet = readJson(FLEET_MANIFEST);
  const consumption = readJson(CONSUMPTION_MANIFEST);
  const release = readJson(RELEASE_MANIFEST);
  const rootPackage = readJson(ROOT_PACKAGE);

  const knownConsumers = new Set((consumption.consumers || []).map((consumer) => consumer.id));
  for (const consumer of fleet.virtualConsumers || []) {
    if (consumer.id) knownConsumers.add(consumer.id);
  }

  const expectedKeys = new Set();
  const expectedConsumerLanesByKey = new Map();
  const utilityIds = new Set();
  const utilityPackageById = new Map();

  for (const pkg of consumption.npmPackages || []) {
    const key = packageKey('npm', pkg.name);
    expectedKeys.add(key);
    for (const lane of pkg.requiredBy || []) addToMapSet(expectedConsumerLanesByKey, key, lane);
  }
  for (const pkg of consumption.pypiPackages || []) {
    const key = packageKey('pypi', pkg.name);
    expectedKeys.add(key);
    for (const lane of pkg.requiredBy || []) addToMapSet(expectedConsumerLanesByKey, key, lane);
  }
  for (const candidate of release.candidatePackages || []) {
    expectedKeys.add(packageKey('npm', candidate.name));
  }
  for (const utility of fleet.utilities || []) {
    utilityIds.add(utility.id);
    const key = utility.packageName
      ? packageKey('npm', utility.packageName)
      : packageKey('pypi', utility.pypiPackage);
    utilityPackageById.set(utility.id, key);
    expectedKeys.add(key);
    for (const lane of utility.requiredBy || []) addToMapSet(expectedConsumerLanesByKey, key, lane);
  }

  return {
    expectedKeys,
    expectedConsumerLanesByKey,
    knownConsumers,
    utilityIds,
    utilityPackageById,
    workspacePackages: workspacePackageNames(root),
    pypiPackages: new Set((consumption.pypiPackages || []).map((pkg) => pkg.name)),
    packageScripts: new Set(Object.keys(rootPackage.scripts || {})),
  };
}

function validateStewardshipManifest(manifest, context) {
  const errors = [];
  const warnings = [];
  const rows = [];
  const ids = new Set();
  const keys = new Set();

  if (manifest.schema !== 'holoscript.package-stewardship/v1') {
    errors.push(`unexpected schema: ${manifest.schema || '<missing>'}`);
  }
  if (!Array.isArray(manifest.principles) || manifest.principles.length < 3) {
    errors.push('manifest must include at least three stewardship principles');
  }
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) {
    errors.push('manifest packages[] is empty');
    return { ok: false, rows, warnings, errors };
  }

  for (const record of manifest.packages) {
    const id = String(record.id || '');
    const registry = String(record.registry || '');
    const name = recordName(record);
    const key = registry && name ? packageKey(registry, name) : null;

    rows.push({
      id,
      registry,
      name: name || null,
      status: record.status || null,
      consumerLanes: record.consumerLanes || [],
      utilityIds: record.utilityIds || [],
      validationScripts: record.validationScripts || [],
    });

    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) errors.push(`invalid package steward id: ${id || '<missing>'}`);
    if (ids.has(id)) errors.push(`duplicate package steward id: ${id}`);
    ids.add(id);

    if (!KNOWN_REGISTRIES.has(registry)) errors.push(`${id}: unknown registry '${registry}'`);
    if (!name) errors.push(`${id}: missing packageName or pypiPackage`);
    if (key && keys.has(key)) errors.push(`${id}: duplicate steward for ${key}`);
    if (key) keys.add(key);

    if (!KNOWN_STATUSES.has(record.status)) {
      errors.push(`${id}: unknown status '${record.status || ''}'`);
    }
    if (!record.constructionRole) errors.push(`${id}: missing constructionRole`);
    if (!record.stewardshipIntent) errors.push(`${id}: missing stewardshipIntent`);
    for (const required of REQUIRED_USER_CLASSES) {
      if (!record.userClasses?.includes(required)) {
        errors.push(`${id}: userClasses[] must include '${required}'`);
      }
    }

    if (!Array.isArray(record.consumerLanes) || record.consumerLanes.length === 0) {
      errors.push(`${id}: missing consumerLanes[]`);
    } else {
      for (const lane of record.consumerLanes) {
        if (!context.knownConsumers.has(lane)) errors.push(`${id}: unknown consumer lane '${lane}'`);
      }
    }

    if (registry === 'npm' && name && !context.workspacePackages.has(name)) {
      errors.push(`${id}: npm package is not in workspace: ${name}`);
    }
    if (registry === 'pypi' && name && !context.pypiPackages.has(name)) {
      errors.push(`${id}: PyPI package is not in package-consumption manifest: ${name}`);
    }

    for (const utilityId of record.utilityIds || []) {
      if (!context.utilityIds.has(utilityId)) {
        errors.push(`${id}: unknown utilityId '${utilityId}'`);
        continue;
      }
      if (key && context.utilityPackageById.get(utilityId) !== key) {
        errors.push(
          `${id}: utilityId '${utilityId}' belongs to ${context.utilityPackageById.get(utilityId)}, not ${key}`
        );
      }
    }

    const expectedLanes = key ? context.expectedConsumerLanesByKey.get(key) : null;
    if (expectedLanes) {
      for (const lane of expectedLanes) {
        if (!record.consumerLanes?.includes(lane)) {
          errors.push(`${id}: consumerLanes[] omits required lane '${lane}'`);
        }
      }
    }

    const hasValidation =
      (Array.isArray(record.validationScripts) && record.validationScripts.length > 0) ||
      (Array.isArray(record.validationCommands) && record.validationCommands.length > 0);
    if (!hasValidation) errors.push(`${id}: missing validationScripts[] or validationCommands[]`);
    for (const script of record.validationScripts || []) {
      if (!context.packageScripts.has(script)) errors.push(`${id}: unknown package script '${script}'`);
    }
    if (!Array.isArray(record.nextActions) || record.nextActions.length === 0) {
      errors.push(`${id}: missing nextActions[]`);
    }

    if (record.status === 'fleet-operational' && (!record.utilityIds || record.utilityIds.length === 0)) {
      warnings.push(`${id}: fleet-operational package has no utilityIds[]`);
    }
  }

  for (const expectedKey of context.expectedKeys) {
    if (!keys.has(expectedKey)) errors.push(`missing steward record for ${expectedKey}`);
  }

  return { ok: errors.length === 0, rows, warnings, errors };
}

function runSelfTest() {
  const context = {
    expectedKeys: new Set([packageKey('npm', '@holoscript/example'), packageKey('pypi', 'holoscript')]),
    expectedConsumerLanesByKey: new Map([
      [packageKey('npm', '@holoscript/example'), new Set(['laptop-windows'])],
      [packageKey('pypi', 'holoscript'), new Set(['laptop-windows'])],
    ]),
    knownConsumers: new Set(['laptop-windows']),
    utilityIds: new Set(['example-utility', 'python-runtime']),
    utilityPackageById: new Map([
      ['example-utility', packageKey('npm', '@holoscript/example')],
      ['python-runtime', packageKey('pypi', 'holoscript')],
    ]),
    workspacePackages: new Set(['@holoscript/example']),
    pypiPackages: new Set(['holoscript']),
    packageScripts: new Set(['check:example']),
  };
  const good = {
    schema: 'holoscript.package-stewardship/v1',
    principles: ['one', 'two', 'three'],
    packages: [
      {
        id: 'example',
        registry: 'npm',
        packageName: '@holoscript/example',
        status: 'fleet-operational',
        constructionRole: 'Example role',
        stewardshipIntent: 'Example intent',
        userClasses: ['human', 'ai-agent'],
        consumerLanes: ['laptop-windows'],
        utilityIds: ['example-utility'],
        validationScripts: ['check:example'],
        nextActions: ['Keep it useful.'],
      },
      {
        id: 'python',
        registry: 'pypi',
        pypiPackage: 'holoscript',
        status: 'fleet-operational',
        constructionRole: 'Python role',
        stewardshipIntent: 'Python intent',
        userClasses: ['human', 'ai-agent'],
        consumerLanes: ['laptop-windows'],
        utilityIds: ['python-runtime'],
        validationScripts: ['check:example'],
        nextActions: ['Keep it useful.'],
      },
    ],
  };
  assert.equal(validateStewardshipManifest(good, context).ok, true);

  const bad = structuredClone(good);
  bad.packages[0].userClasses = ['human'];
  bad.packages[0].validationScripts = ['missing:script'];
  bad.packages.pop();
  const result = validateStewardshipManifest(bad, context);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes("ai-agent")));
  assert(result.errors.some((error) => error.includes('missing steward record for pypi:holoscript')));
  assert(result.errors.some((error) => error.includes("unknown package script 'missing:script'")));

  console.log('[package-stewardship] self-test PASS');
}

if (SELF_TEST) {
  runSelfTest();
  process.exit(0);
}

const errors = [];
for (const file of [MANIFEST, FLEET_MANIFEST, CONSUMPTION_MANIFEST, RELEASE_MANIFEST, ROOT_PACKAGE]) {
  if (!existsSync(file)) errors.push(`required file missing: ${file}`);
}

let output;
if (errors.length > 0) {
  output = { ok: false, rows: [], warnings: [], errors };
} else {
  output = validateStewardshipManifest(readJson(MANIFEST), contextFromFiles(ROOT));
}

if (JSON_OUT) {
  console.log(JSON.stringify(output, null, 2));
} else {
  for (const row of output.rows) {
    console.log(
      `[package-stewardship] ${row.registry}:${row.name} ${row.status} lanes=${row.consumerLanes.join(',')} checks=${row.validationScripts.join(',')}`
    );
  }
  for (const warning of output.warnings) console.warn(`[package-stewardship] WARN: ${warning}`);
  if (output.errors.length > 0) {
    console.error(`[package-stewardship] FAIL: ${output.errors.length} issue(s)`);
    for (const error of output.errors) console.error(`  - ${error}`);
  } else {
    console.log('[package-stewardship] PASS: package stewardship map is coherent.');
  }
}

process.exit(output.ok ? 0 : 1);
