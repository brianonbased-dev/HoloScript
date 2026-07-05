#!/usr/bin/env node
/**
 * Verifies that laptop, Jetson, and Vast fleet lanes can consume the npm/PyPI
 * package artifacts they are expected to install.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const PACK_NPM = args.includes('--pack-npm');
const BUILD_PYTHON = args.includes('--build-python');
const SELF_TEST = args.includes('--self-test');
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const outIdx = args.indexOf('--out-dir');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'package-consumption-manifest.json');
const OUT_DIR =
  outIdx >= 0
    ? resolve(args[outIdx + 1])
    : join(ROOT, '.scratch', 'package-consumption-matrix');
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const PYTHON_BIN = process.env.PYTHON || 'python';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function run(cmd, cmdArgs, opts = {}) {
  const exe = cmd === 'npm' ? NPM_BIN : cmd;
  return execFileSync(exe, cmdArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: cmd === 'npm' && process.platform === 'win32',
    ...opts,
  });
}

function supportsNpmSelector(selectors, value) {
  if (!Array.isArray(selectors) || selectors.length === 0) return true;
  const positives = selectors.filter((item) => !String(item).startsWith('!'));
  const negatives = selectors
    .filter((item) => String(item).startsWith('!'))
    .map((item) => String(item).slice(1));
  if (negatives.includes(value)) return false;
  return positives.length === 0 || positives.includes(value);
}

function normalizePackPath(path) {
  return String(path || '')
    .replace(/^package\//, '')
    .replace(/^\.\//, '')
    .replace(/\\/g, '/');
}

function parsePyprojectValue(text, key) {
  const match = text.match(new RegExp(`^${key}\\s*=\\s*\"([^\"]+)\"`, 'm'));
  return match ? match[1] : null;
}

function parseProjectScripts(text) {
  const scripts = new Set();
  const block = text.match(/^\[project\.scripts\]\s*$(?<body>[\s\S]*?)(?:^\[|\z)/m);
  if (!block?.groups?.body) return scripts;
  for (const line of block.groups.body.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=/);
    if (match) scripts.add(match[1]);
  }
  return scripts;
}

function parseProjectOptionalDependencyGroups(text) {
  const groups = new Set();
  const block = text.match(/^\[project\.optional-dependencies\]\s*$(?<body>[\s\S]*?)(?:^\[|\z)/m);
  if (!block?.groups?.body) return groups;
  for (const line of block.groups.body.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.-]+)\s*=\s*\[/);
    if (match) groups.add(match[1]);
  }
  return groups;
}

function parseDistInfoFromBuildOutput(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.match(/Successfully built (?<files>.+)$/)?.groups?.files)
    .filter(Boolean)
    .flatMap((files) => files.split(/\s+/).filter((file) => file && file !== 'and'));
}

function minimumVersionFromRange(range) {
  const match = String(range || '').match(/>=\s*(\d+(?:\.\d+){0,2})/);
  return match ? match[1] : null;
}

function compareDottedVersions(a, b) {
  const left = String(a).split('.').map((part) => Number(part));
  const right = String(b).split('.').map((part) => Number(part));
  const length = Math.max(left.length, right.length, 3);
  for (let i = 0; i < length; i += 1) {
    const l = Number.isFinite(left[i]) ? left[i] : 0;
    const r = Number.isFinite(right[i]) ? right[i] : 0;
    if (l > r) return 1;
    if (l < r) return -1;
  }
  return 0;
}

function checkRuntimeMinimum(pkgName, runtimeName, packageRange, consumerId, consumerRange, errors, warnings) {
  const packageMin = minimumVersionFromRange(packageRange);
  const consumerMin = minimumVersionFromRange(consumerRange);
  if (!packageMin) {
    warnings.push(`${pkgName}: cannot parse ${runtimeName} requirement '${packageRange}'`);
    return;
  }
  if (!consumerMin) {
    errors.push(`${pkgName}: cannot parse ${consumerId} ${runtimeName} runtime '${consumerRange}'`);
    return;
  }
  if (compareDottedVersions(packageMin, consumerMin) > 0) {
    errors.push(
      `${pkgName}: requires ${runtimeName} ${packageRange}, but ${consumerId} is declared as ${consumerRange}`
    );
  }
}

function checkConsumerShape(manifest, errors) {
  const consumers = new Map();
  for (const consumer of manifest.consumers || []) {
    if (!consumer.id) errors.push('consumer missing id');
    if (!consumer.os) errors.push(`${consumer.id || '<unknown>'}: consumer missing os`);
    if (!consumer.cpu) errors.push(`${consumer.id || '<unknown>'}: consumer missing cpu`);
    if (!consumer.node) errors.push(`${consumer.id || '<unknown>'}: consumer missing node`);
    if (!consumer.python) errors.push(`${consumer.id || '<unknown>'}: consumer missing python`);
    consumers.set(consumer.id, consumer);
  }
  return consumers;
}

function assertConsumersKnown(pkg, consumers, errors) {
  for (const id of pkg.requiredBy || []) {
    if (!consumers.has(id)) errors.push(`${pkg.name}: unknown consumer '${id}'`);
  }
}

function checkNpmPackage(pkg, consumers, errors, warnings, rows) {
  assertConsumersKnown(pkg, consumers, errors);
  const dir = resolve(ROOT, pkg.packageDir || '');
  const manifestPath = join(dir, 'package.json');
  if (!existsSync(manifestPath)) {
    errors.push(`${pkg.name}: package.json not found at ${pkg.packageDir}`);
    return;
  }
  const json = readJson(manifestPath);
  const row = { type: 'npm', name: pkg.name, requiredBy: pkg.requiredBy || [], packEntries: null };
  rows.push(row);

  if (json.name !== pkg.name) errors.push(`${pkg.name}: package.json name is ${json.name}`);
  if (json.private === true) errors.push(`${pkg.name}: package is private`);
  if (!json.version || !/^\d+\.\d+\.\d+(?:-.+)?$/.test(json.version)) {
    errors.push(`${pkg.name}: version is not semver-ish (${json.version || 'missing'})`);
  }
  for (const field of ['description', 'license', 'repository']) {
    if (!json[field]) errors.push(`${pkg.name}: missing npm metadata field '${field}'`);
  }
  if (!Array.isArray(json.files) || json.files.length === 0) {
    errors.push(`${pkg.name}: missing files[] package allowlist`);
  }
  if (!json.main && !json.exports && !json.bin) {
    errors.push(`${pkg.name}: no main, exports, or bin entrypoint`);
  }
  if (!json.engines?.node) {
    warnings.push(`${pkg.name}: no package-level engines.node; relying on root/fleet Node policy`);
  }
  for (const id of pkg.requiredBy || []) {
    const consumer = consumers.get(id);
    if (!consumer) continue;
    if (json.engines?.node) {
      checkRuntimeMinimum(pkg.name, 'node', json.engines.node, id, consumer.node, errors, warnings);
    }
    if (!supportsNpmSelector(json.os, consumer.os)) {
      errors.push(`${pkg.name}: os field does not support ${id} (${consumer.os})`);
    }
    if (!supportsNpmSelector(json.cpu, consumer.cpu)) {
      errors.push(`${pkg.name}: cpu field does not support ${id} (${consumer.cpu})`);
    }
  }
  for (const binName of pkg.requireBins || []) {
    if (!json.bin?.[binName]) errors.push(`${pkg.name}: missing required bin '${binName}'`);
  }
  for (const file of pkg.requireFiles || []) {
    if (!existsSync(join(dir, file))) errors.push(`${pkg.name}: required artifact missing before pack: ${file}`);
  }

  if (!PACK_NPM) return;
  const packOut = run('npm', ['pack', '--dry-run', '--json'], { cwd: dir });
  const parsed = JSON.parse(packOut);
  const files = new Set((parsed[0]?.files || []).map((entry) => normalizePackPath(entry.path)));
  row.packEntries = files.size;
  for (const file of pkg.requireFiles || []) {
    if (!files.has(file)) errors.push(`${pkg.name}: npm pack does not include ${file}`);
  }
  for (const binPath of Object.values(json.bin || {})) {
    const normalized = normalizePackPath(binPath);
    if (!files.has(normalized)) errors.push(`${pkg.name}: npm pack does not include bin target ${normalized}`);
  }
  if (pkg.forbidBundledNativeAddons) {
    const nativeAddons = [...files].filter((file) => file.endsWith('.node'));
    if (nativeAddons.length) {
      errors.push(
        `${pkg.name}: npm pack includes native addon(s) despite fleet consumption: ${nativeAddons.join(', ')}`
      );
    }
  }
}

function checkPyPackage(pkg, consumers, errors, warnings, rows) {
  assertConsumersKnown(pkg, consumers, errors);
  const dir = resolve(ROOT, pkg.packageDir || '');
  const pyproject = join(dir, 'pyproject.toml');
  if (!existsSync(pyproject)) {
    errors.push(`${pkg.name}: pyproject.toml not found at ${pkg.packageDir}`);
    return;
  }
  const text = readFileSync(pyproject, 'utf8');
  const row = { type: 'pypi', name: pkg.name, requiredBy: pkg.requiredBy || [], built: [] };
  rows.push(row);

  const projectName = parsePyprojectValue(text, 'name');
  const version = parsePyprojectValue(text, 'version');
  const requiresPython = parsePyprojectValue(text, 'requires-python');
  if (projectName !== pkg.name) errors.push(`${pkg.name}: pyproject name is ${projectName || 'missing'}`);
  if (!version || !/^\d+\.\d+\.\d+(?:-.+)?$/.test(version)) {
    errors.push(`${pkg.name}: version is not semver-ish (${version || 'missing'})`);
  }
  if (!requiresPython) errors.push(`${pkg.name}: missing requires-python`);
  if (requiresPython) {
    for (const id of pkg.requiredBy || []) {
      const consumer = consumers.get(id);
      if (!consumer) continue;
      checkRuntimeMinimum(pkg.name, 'python', requiresPython, id, consumer.python, errors, warnings);
    }
  }
  if (!/^license\s*=\s*"[^"]+"/m.test(text)) {
    errors.push(`${pkg.name}: license must use SPDX string form, e.g. license = "MIT"`);
  }
  if (!text.includes('[build-system]')) errors.push(`${pkg.name}: missing [build-system]`);
  for (const importName of pkg.imports || []) {
    const importPath = join(dir, ...importName.split('.'), '__init__.py');
    if (!existsSync(importPath)) errors.push(`${pkg.name}: missing import package ${importName}`);
  }
  const scripts = parseProjectScripts(text);
  for (const script of pkg.consoleScripts || []) {
    if (!scripts.has(script)) errors.push(`${pkg.name}: missing console script ${script}`);
  }
  const extras = parseProjectOptionalDependencyGroups(text);
  for (const [consumerId, requestedExtras] of Object.entries(pkg.extrasByConsumer || {})) {
    if (!consumers.has(consumerId)) errors.push(`${pkg.name}: extrasByConsumer references unknown consumer '${consumerId}'`);
    for (const extra of requestedExtras || []) {
      if (!extras.has(extra)) errors.push(`${pkg.name}: missing optional dependency extra '${extra}' for ${consumerId}`);
    }
  }

  if (!BUILD_PYTHON) return;
  const outDir = join(OUT_DIR, pkg.name.replace(/[^\w.-]+/g, '_'));
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const stdout = run(PYTHON_BIN, ['-m', 'build', '--outdir', outDir, dir], { cwd: ROOT });
  row.built = parseDistInfoFromBuildOutput(stdout);
  const artifacts = readdirSync(outDir).filter((file) => file.endsWith('.whl') || file.endsWith('.tar.gz'));
  if (!artifacts.some((file) => file.endsWith('.whl'))) errors.push(`${pkg.name}: build produced no wheel`);
  if (!artifacts.some((file) => file.endsWith('.tar.gz'))) errors.push(`${pkg.name}: build produced no sdist`);
  try {
    run(PYTHON_BIN, ['-m', 'twine', 'check', ...artifacts.map((file) => join(outDir, file))], {
      cwd: ROOT,
    });
  } catch (error) {
    errors.push(`${pkg.name}: twine check failed: ${String(error.stderr || error.message).slice(0, 800)}`);
  }
}

function runSelfTest() {
  const errors = [];
  if (!supportsNpmSelector(undefined, 'linux')) errors.push('empty selector should allow linux');
  if (!supportsNpmSelector(['linux'], 'linux')) errors.push('positive selector should allow match');
  if (supportsNpmSelector(['linux'], 'win32')) errors.push('positive selector should reject miss');
  if (supportsNpmSelector(['!linux'], 'linux')) errors.push('negative selector should reject match');
  if (normalizePackPath('package/bin/x.cjs') !== 'bin/x.cjs') errors.push('pack path normalization failed');
  const scripts = parseProjectScripts('[project.scripts]\ntrait-inference = "trait_inference.cli:main"\n\n[tool.x]\n');
  if (!scripts.has('trait-inference')) errors.push('project script parser failed');
  const extras = parseProjectOptionalDependencyGroups('[project.optional-dependencies]\nmodel = [\n  "torch"\n]\n\n[tool.x]\n');
  if (!extras.has('model')) errors.push('optional dependency parser failed');
  if (minimumVersionFromRange('>=3.10') !== '3.10') errors.push('version range parser failed');
  if (compareDottedVersions('20.0.0', '18.0.0') <= 0) errors.push('version comparator failed');
  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }
  console.log('[package-consumption] self-test PASS');
}

function main() {
  if (SELF_TEST) return runSelfTest();
  const errors = [];
  const warnings = [];
  const rows = [];
  const manifest = readJson(MANIFEST);
  const consumers = checkConsumerShape(manifest, errors);
  for (const pkg of manifest.npmPackages || []) checkNpmPackage(pkg, consumers, errors, warnings, rows);
  for (const pkg of manifest.pypiPackages || []) checkPyPackage(pkg, consumers, errors, warnings, rows);

  const output = {
    ok: errors.length === 0,
    packNpm: PACK_NPM,
    buildPython: BUILD_PYTHON,
    consumers: [...consumers.keys()],
    rows,
    warnings,
    errors,
  };
  if (JSON_OUT) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    for (const row of rows) {
      const detail =
        row.type === 'npm' && row.packEntries !== null
          ? ` packEntries=${row.packEntries}`
          : row.type === 'pypi' && row.built.length
            ? ` built=${row.built.join(',')}`
            : '';
      console.log(`[package-consumption] ${row.type} ${row.name} -> ${row.requiredBy.join(',')}${detail}`);
    }
    for (const warning of warnings) console.warn(`[package-consumption] WARN: ${warning}`);
    if (errors.length) {
      console.error(`[package-consumption] FAIL: ${errors.length} issue(s)`);
      for (const error of errors) console.error(`  - ${error}`);
    } else {
      console.log('[package-consumption] PASS: package consumption matrix is valid.');
    }
  }
  process.exit(errors.length === 0 ? 0 : 1);
}

main();
