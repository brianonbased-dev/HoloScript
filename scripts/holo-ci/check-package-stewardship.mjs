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
const KNOWN_STATUSES = new Set(['fleet-operational', 'release-candidate', 'incubating', 'parked']);
const KNOWN_BLOCKER_STATUSES = new Set(['active', 'parked', 'resolved']);
const REQUIRED_USER_CLASSES = new Set(['human', 'ai-agent']);
const READY_STATUSES = new Set(['fleet-operational', 'release-candidate']);
const KNOWN_OUTSIDE_READINESS = new Set(['ready', 'incubating', 'parked']);
const KNOWN_HARNESS_MODES = new Set(['standalone', 'public-ai-ecosystem-template', 'not-public']);
const REQUIRED_OUTSIDE_AUDIENCE = new Set(['external-human', 'external-ai-agent']);
const PRIVATE_PUBLIC_FILE_PATTERNS = [
  ['founder Windows home path', /C:[/\\]Users[/\\]josep/i],
  ['founder GOLD drive path', /D:[/\\]GOLD/i],
  [
    'literal secret assignment',
    /^\s*(?:HOLOSCRIPT_API_KEY|HOLOSCRIPT_MCP_API_KEY|NPM_TOKEN|PYPI_API_TOKEN)[ \t]*=[ \t]*(?!$|#|<|your-|example|changeme|replace|optional|__)[^\r\n#]+/im,
  ],
];

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

function isSafePublicPath(relativePath) {
  const text = String(relativePath || '').replace(/\\/g, '/');
  if (!text || text.includes('\0')) return false;
  if (text.startsWith('/') || text.startsWith('../') || text.includes('/../')) return false;
  if (/^[A-Za-z]:/.test(text)) return false;
  return true;
}

function readPublicFileText(context, relativePath) {
  if (!isSafePublicPath(relativePath)) return { unsafe: true, text: null };
  if (context.publicFiles) {
    return {
      unsafe: false,
      text: context.publicFiles.has(relativePath) ? context.publicFiles.get(relativePath) : null,
    };
  }
  const root = context.root || ROOT;
  const full = resolve(root, relativePath);
  const rootPrefix = `${resolve(root)}${process.platform === 'win32' ? '\\' : '/'}`;
  if (full !== resolve(root) && !full.startsWith(rootPrefix)) return { unsafe: true, text: null };
  if (!existsSync(full)) return { unsafe: false, text: null };
  return { unsafe: false, text: readFileSync(full, 'utf8') };
}

function validatePublicFile(context, id, field, relativePath, allowPrivateLeaks, errors) {
  const result = readPublicFileText(context, relativePath);
  if (result.unsafe) {
    errors.push(`${id}: outsideUserGate.${field} is not a safe repo-relative public path`);
    return;
  }
  if (result.text === null) {
    errors.push(`${id}: outsideUserGate.${field} missing public file '${relativePath}'`);
    return;
  }
  if (allowPrivateLeaks) return;
  for (const [label, pattern] of PRIVATE_PUBLIC_FILE_PATTERNS) {
    if (pattern.test(result.text)) {
      errors.push(`${id}: outsideUserGate.${field} leaks ${label}: ${relativePath}`);
    }
  }
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

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateStewardshipNotes(record, errors) {
  const id = String(record.id || '<missing>');
  if (record.blockers !== undefined && !Array.isArray(record.blockers)) {
    errors.push(`${id}: blockers must be an array when present`);
  }
  for (const [index, blocker] of (record.blockers || []).entries()) {
    const prefix = `${id}: blockers[${index}]`;
    if (!blocker || typeof blocker !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(blocker.id || ''))) {
      errors.push(`${prefix}.id is missing or invalid`);
    }
    if (!KNOWN_BLOCKER_STATUSES.has(blocker.status)) {
      errors.push(
        `${prefix}.status must be one of ${Array.from(KNOWN_BLOCKER_STATUSES).join(', ')}`
      );
    }
    if (!isNonEmptyString(blocker.scope)) errors.push(`${prefix}.scope is required`);
    if (!isNonEmptyString(blocker.summary)) errors.push(`${prefix}.summary is required`);
    if (blocker.status !== 'resolved' && !isNonEmptyString(blocker.nextUnblockAction)) {
      errors.push(`${prefix}.nextUnblockAction is required while blocker is not resolved`);
    }
    if (blocker.evidenceCommand !== undefined && !isNonEmptyString(blocker.evidenceCommand)) {
      errors.push(`${prefix}.evidenceCommand must be non-empty when present`);
    }
  }

  if (record.caveats !== undefined && !Array.isArray(record.caveats)) {
    errors.push(`${id}: caveats must be an array when present`);
  }
  for (const [index, caveat] of (record.caveats || []).entries()) {
    const prefix = `${id}: caveats[${index}]`;
    if (!caveat || typeof caveat !== 'object') {
      errors.push(`${prefix} must be an object`);
      continue;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(String(caveat.id || ''))) {
      errors.push(`${prefix}.id is missing or invalid`);
    }
    if (!isNonEmptyString(caveat.scope)) errors.push(`${prefix}.scope is required`);
    if (!isNonEmptyString(caveat.summary)) errors.push(`${prefix}.summary is required`);
    if (!isNonEmptyString(caveat.overclaimGuard))
      errors.push(`${prefix}.overclaimGuard is required`);
  }
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
    root,
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
      outsideReadiness: record.outsideUserGate?.readiness || null,
      harnessMode: record.outsideUserGate?.harnessMode || null,
      activeBlockers: (record.blockers || []).filter((blocker) => blocker.status === 'active')
        .length,
      caveats: (record.caveats || []).length,
    });

    if (!/^[a-z0-9][a-z0-9-]*$/.test(id))
      errors.push(`invalid package steward id: ${id || '<missing>'}`);
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

    const outsideGate = record.outsideUserGate;
    if (!outsideGate || typeof outsideGate !== 'object') {
      errors.push(`${id}: missing outsideUserGate`);
    } else {
      if (!KNOWN_OUTSIDE_READINESS.has(outsideGate.readiness)) {
        errors.push(
          `${id}: outsideUserGate has unknown readiness '${outsideGate.readiness || ''}'`
        );
      }
      if (!KNOWN_HARNESS_MODES.has(outsideGate.harnessMode)) {
        errors.push(
          `${id}: outsideUserGate has unknown harnessMode '${outsideGate.harnessMode || ''}'`
        );
      }
      for (const required of REQUIRED_OUTSIDE_AUDIENCE) {
        if (!outsideGate.audience?.includes(required)) {
          errors.push(`${id}: outsideUserGate.audience[] must include '${required}'`);
        }
      }
      if (outsideGate.privateHarnessLeakAllowed !== false) {
        errors.push(`${id}: outsideUserGate.privateHarnessLeakAllowed must be false`);
      }
      if (READY_STATUSES.has(record.status) && outsideGate.readiness !== 'ready') {
        errors.push(`${id}: ${record.status} package must have outsideUserGate.readiness='ready'`);
      }
      if (outsideGate.harnessMode === 'not-public' && outsideGate.readiness === 'ready') {
        errors.push(`${id}: outsideUserGate cannot be ready while harnessMode is not-public`);
      }
      if (
        outsideGate.harnessMode === 'public-ai-ecosystem-template' &&
        (!Array.isArray(outsideGate.requiredPublicFiles) ||
          outsideGate.requiredPublicFiles.length === 0)
      ) {
        errors.push(`${id}: public-ai-ecosystem-template requires requiredPublicFiles[]`);
      }
      if (!outsideGate.publicEntry) {
        errors.push(`${id}: outsideUserGate missing publicEntry`);
      } else {
        validatePublicFile(
          context,
          id,
          'publicEntry',
          outsideGate.publicEntry,
          outsideGate.privateHarnessLeakAllowed,
          errors
        );
      }
      for (const publicFile of outsideGate.requiredPublicFiles || []) {
        validatePublicFile(
          context,
          id,
          'requiredPublicFiles',
          publicFile,
          outsideGate.privateHarnessLeakAllowed,
          errors
        );
      }
    }

    if (!Array.isArray(record.consumerLanes) || record.consumerLanes.length === 0) {
      errors.push(`${id}: missing consumerLanes[]`);
    } else {
      for (const lane of record.consumerLanes) {
        if (!context.knownConsumers.has(lane))
          errors.push(`${id}: unknown consumer lane '${lane}'`);
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
      if (!context.packageScripts.has(script))
        errors.push(`${id}: unknown package script '${script}'`);
    }
    if (!Array.isArray(record.nextActions) || record.nextActions.length === 0) {
      errors.push(`${id}: missing nextActions[]`);
    }
    validateStewardshipNotes(record, errors);

    if (
      record.status === 'fleet-operational' &&
      (!record.utilityIds || record.utilityIds.length === 0)
    ) {
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
    expectedKeys: new Set([
      packageKey('npm', '@holoscript/example'),
      packageKey('pypi', 'holoscript'),
    ]),
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
    publicFiles: new Map([['README.md', 'public package docs']]),
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
        outsideUserGate: {
          readiness: 'ready',
          harnessMode: 'standalone',
          audience: ['external-human', 'external-ai-agent'],
          publicEntry: 'README.md',
          requiredPublicFiles: [],
          privateHarnessLeakAllowed: false,
        },
        consumerLanes: ['laptop-windows'],
        utilityIds: ['example-utility'],
        validationScripts: ['check:example'],
        nextActions: ['Keep it useful.'],
        blockers: [
          {
            id: 'operator-credential',
            status: 'active',
            scope: 'laptop-windows',
            summary: 'A live operator credential is required for this example lane.',
            nextUnblockAction: 'Set the example credential and rerun check:example.',
            evidenceCommand: 'pnpm run check:example',
          },
        ],
        caveats: [
          {
            id: 'no-live-hardware',
            scope: 'public-package',
            summary: 'The example validates package shape, not live hardware.',
            overclaimGuard: 'Do not claim hardware readiness from the package-shape check.',
          },
        ],
      },
      {
        id: 'python',
        registry: 'pypi',
        pypiPackage: 'holoscript',
        status: 'fleet-operational',
        constructionRole: 'Python role',
        stewardshipIntent: 'Python intent',
        userClasses: ['human', 'ai-agent'],
        outsideUserGate: {
          readiness: 'ready',
          harnessMode: 'standalone',
          audience: ['external-human', 'external-ai-agent'],
          publicEntry: 'README.md',
          requiredPublicFiles: [],
          privateHarnessLeakAllowed: false,
        },
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
  bad.packages[0].outsideUserGate = {
    readiness: 'ready',
    harnessMode: 'public-ai-ecosystem-template',
    audience: ['external-human'],
    publicEntry: 'missing.md',
    requiredPublicFiles: [],
    privateHarnessLeakAllowed: true,
  };
  bad.packages[0].blockers = [{ id: 'bad-blocker', status: 'active', scope: '', summary: '' }];
  bad.packages[0].caveats = [{ id: 'bad-caveat', summary: 'Missing scope and guard.' }];
  bad.packages.pop();
  const result = validateStewardshipManifest(bad, context);
  assert.equal(result.ok, false);
  assert(result.errors.some((error) => error.includes('ai-agent')));
  assert(
    result.errors.some((error) => error.includes('missing steward record for pypi:holoscript'))
  );
  assert(result.errors.some((error) => error.includes("unknown package script 'missing:script'")));
  assert(result.errors.some((error) => error.includes('privateHarnessLeakAllowed')));
  assert(result.errors.some((error) => error.includes('requiredPublicFiles')));
  assert(result.errors.some((error) => error.includes("missing public file 'missing.md'")));
  assert(result.errors.some((error) => error.includes('blockers[0].nextUnblockAction')));
  assert(result.errors.some((error) => error.includes('caveats[0].overclaimGuard')));

  console.log('[package-stewardship] self-test PASS');
}

if (SELF_TEST) {
  runSelfTest();
  process.exit(0);
}

const errors = [];
for (const file of [
  MANIFEST,
  FLEET_MANIFEST,
  CONSUMPTION_MANIFEST,
  RELEASE_MANIFEST,
  ROOT_PACKAGE,
]) {
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
      `[package-stewardship] ${row.registry}:${row.name} ${row.status} lanes=${row.consumerLanes.join(',')} checks=${row.validationScripts.join(',')}` +
        ` outside=${row.outsideReadiness}/${row.harnessMode}` +
        ` activeBlockers=${row.activeBlockers} caveats=${row.caveats}`
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
