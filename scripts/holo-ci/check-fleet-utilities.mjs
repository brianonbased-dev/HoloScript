#!/usr/bin/env node
/**
 * Verifies the fleet utility map against package-consumption consumers,
 * workspace package metadata, MCP sizing profiles, and HoloLlama profiles.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const rootIdx = args.indexOf('--root');
const manifestIdx = args.indexOf('--manifest');
const ROOT = rootIdx >= 0 ? resolve(args[rootIdx + 1]) : resolve(__dirname, '..', '..');
const MANIFEST =
  manifestIdx >= 0
    ? resolve(args[manifestIdx + 1])
    : join(ROOT, 'scripts', 'holo-ci', 'fleet-utilities-manifest.json');
const CONSUMPTION_MANIFEST = join(ROOT, 'scripts', 'holo-ci', 'package-consumption-manifest.json');
const SERVER_SIZING = join(ROOT, 'packages', 'mcp-server', 'src', 'server-sizing.ts');
const HOLOLLAMA_INDEX = join(ROOT, 'packages', 'holollama', 'src', 'index.ts');
const WORKSPACE_ROOTS = ['packages', 'services', 'benchmarks'];
const SKIP_DIRS = new Set(['node_modules', 'dist', '.next', 'coverage', '.turbo', '.git']);

const errors = [];
const warnings = [];
const rows = [];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
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

function workspacePackages() {
  const byName = new Map();
  for (const root of WORKSPACE_ROOTS) {
    for (const manifest of discoverPackageJsons(join(ROOT, root))) {
      const pkg = readJson(manifest);
      if (pkg.name) byName.set(pkg.name, { dir: dirname(manifest), json: pkg });
    }
  }
  return byName;
}

function parseObjectKeys(source, exportName) {
  const text = readFileSync(source, 'utf8');
  const marker = `export const ${exportName}`;
  const start = text.indexOf(marker);
  if (start < 0) return new Set();
  const bodyStart = text.indexOf('{', start);
  const end = text.indexOf('\n};', bodyStart);
  if (bodyStart < 0 || end < 0) return new Set();
  const body = text.slice(bodyStart + 1, end);
  const keys = new Set();
  for (const match of body.matchAll(/^\s*['"]?([A-Za-z0-9_-]+)['"]?:\s*\{/gm)) {
    keys.add(match[1]);
  }
  return keys;
}

function parseHoloLlamaProfiles() {
  return parseObjectKeys(HOLOLLAMA_INDEX, 'HOLOLLAMA_PROFILE_DEFINITIONS');
}

function checkPackageCommands(utility, pkg) {
  for (const command of utility.commands || []) {
    if (!pkg.json.bin?.[command]) {
      errors.push(`${utility.id}: ${utility.packageName} does not expose bin '${command}'`);
    }
  }
}

function checkUtility(utility, context) {
  rows.push({
    id: utility.id,
    packageName: utility.packageName || null,
    pypiPackage: utility.pypiPackage || null,
    requiredBy: utility.requiredBy || [],
  });

  if (!/^[a-z0-9][a-z0-9-]*$/.test(String(utility.id || ''))) {
    errors.push(`utility id is missing or invalid: ${String(utility.id || '<missing>')}`);
  }
  if (!utility.label) errors.push(`${utility.id}: missing label`);
  if (!Array.isArray(utility.useCases) || utility.useCases.length === 0) {
    errors.push(`${utility.id}: missing useCases[]`);
  }
  if (!utility.packageName && !utility.pypiPackage) {
    errors.push(`${utility.id}: must declare packageName or pypiPackage`);
  }
  for (const consumer of utility.requiredBy || []) {
    if (!context.consumers.has(consumer))
      errors.push(`${utility.id}: unknown consumer '${consumer}'`);
  }
  for (const profile of utility.sizingProfiles || []) {
    if (!context.sizingProfiles.has(profile)) {
      errors.push(`${utility.id}: unknown MCP sizing profile '${profile}'`);
    }
  }
  for (const profile of utility.holollamaProfiles || []) {
    if (!context.holollamaProfiles.has(profile)) {
      errors.push(`${utility.id}: unknown HoloLlama profile '${profile}'`);
    }
  }
  if (utility.packageName) {
    const pkg = context.workspace.get(utility.packageName);
    if (!pkg) {
      errors.push(`${utility.id}: workspace package not found for ${utility.packageName}`);
    } else {
      checkPackageCommands(utility, pkg);
    }
  }
  if (utility.pypiPackage && !context.pypiPackages.has(utility.pypiPackage)) {
    errors.push(`${utility.id}: PyPI package is not in package-consumption manifest`);
  }
  if (utility.mcpTools?.length && utility.packageName !== '@holoscript/mcp-server') {
    warnings.push(`${utility.id}: mcpTools declared outside @holoscript/mcp-server`);
  }
}

if (!existsSync(MANIFEST)) errors.push(`manifest missing: ${MANIFEST}`);
if (!existsSync(CONSUMPTION_MANIFEST))
  errors.push(`package consumption manifest missing: ${CONSUMPTION_MANIFEST}`);

if (errors.length === 0) {
  const manifest = readJson(MANIFEST);
  const consumption = readJson(CONSUMPTION_MANIFEST);
  const consumers = new Set((consumption.consumers || []).map((consumer) => consumer.id));
  for (const consumer of manifest.virtualConsumers || []) {
    if (!consumer.id) errors.push('virtual consumer missing id');
    consumers.add(consumer.id);
  }
  const context = {
    consumers,
    workspace: workspacePackages(),
    pypiPackages: new Set((consumption.pypiPackages || []).map((pkg) => pkg.name)),
    sizingProfiles: parseObjectKeys(SERVER_SIZING, 'MCP_SERVER_SIZING_PROFILES'),
    holollamaProfiles: parseHoloLlamaProfiles(),
  };

  if (manifest.schema !== 'holoscript.fleet-utilities/v1') {
    errors.push(`unexpected schema: ${manifest.schema || '<missing>'}`);
  }
  if (!Array.isArray(manifest.utilities) || manifest.utilities.length === 0) {
    errors.push('manifest utilities[] is empty');
  } else {
    const ids = new Set();
    for (const utility of manifest.utilities) {
      if (ids.has(utility.id)) errors.push(`duplicate utility id: ${utility.id}`);
      ids.add(utility.id);
      checkUtility(utility, context);
    }
  }
}

const output = { ok: errors.length === 0, rows, warnings, errors };
if (JSON_OUT) {
  console.log(JSON.stringify(output, null, 2));
} else {
  for (const row of rows) {
    const target = row.packageName || row.pypiPackage;
    console.log(`[fleet-utilities] ${row.id} -> ${target} (${row.requiredBy.join(',')})`);
  }
  for (const warning of warnings) console.warn(`[fleet-utilities] WARN: ${warning}`);
  if (errors.length) {
    console.error(`[fleet-utilities] FAIL: ${errors.length} issue(s)`);
    for (const error of errors) console.error(`  - ${error}`);
  } else {
    console.log('[fleet-utilities] PASS: utility map is coherent.');
  }
}

process.exit(errors.length === 0 ? 0 : 1);
