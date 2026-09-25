#!/usr/bin/env node
/**
 * Fail when a declared dependency resolves to a directory that exists but is
 * empty or has no package.json. pnpm install can exit 0 in that case because
 * it only checks that the folder exists.
 *
 * Usage:
 *   node scripts/check-pnpm-install-integrity.mjs [--root <path>]
 */

import { existsSync, lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(HERE, '..');

export function argValue(argv, name, fallback = null) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] || fallback : fallback;
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function isExternalDep(spec) {
  const value = String(spec || '').trim();
  if (!value) return false;
  return !/^(workspace:|link:|file:)/u.test(value);
}

function depNamesFromPackage(pkg) {
  const names = [];
  for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const block = pkg[field];
    if (!block || typeof block !== 'object') continue;
    for (const [name, spec] of Object.entries(block)) {
      if (isExternalDep(spec)) names.push(name);
    }
  }
  return names;
}

function listWorkspaceDirs(root, pattern) {
  const star = pattern.indexOf('*');
  if (star < 0) {
    const dir = join(root, pattern);
    return existsSync(dir) ? [dir] : [];
  }
  const parent = join(root, pattern.slice(0, star).replace(/\/$/u, ''));
  const suffix = pattern.slice(star + 1).replace(/^\//u, '');
  if (!existsSync(parent)) return [];
  return readdirSync(parent, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => (suffix ? join(parent, entry.name, suffix) : join(parent, entry.name)))
    .filter((dir) => existsSync(join(dir, 'package.json')));
}

export function collectDeclaredDependencyNames(root) {
  const names = new Set();
  const rootPkg = readJson(join(root, 'package.json'));
  for (const name of depNamesFromPackage(rootPkg)) names.add(name);
  const workspaces = Array.isArray(rootPkg.workspaces) ? rootPkg.workspaces : [];
  for (const pattern of workspaces) {
    for (const dir of listWorkspaceDirs(root, pattern)) {
      const pkg = readJson(join(dir, 'package.json'));
      for (const name of depNamesFromPackage(pkg)) names.add(name);
    }
  }
  return [...names].sort();
}

export function isContentlessPackageDir(dir) {
  if (!existsSync(dir)) return false;
  let target = dir;
  try {
    if (lstatSync(dir).isSymbolicLink()) target = realpathSync(dir);
  } catch {
    return true;
  }
  if (!existsSync(target) || !statSync(target).isDirectory()) return true;
  const entries = readdirSync(target).filter((name) => name !== '.' && name !== '..');
  if (entries.length === 0) return true;
  return !existsSync(join(target, 'package.json'));
}

export function inspectDeclaredDependency(root, name) {
  const resolved = join(root, 'node_modules', ...name.split('/'));
  if (!existsSync(resolved)) {
    return { name, resolved, status: 'missing' };
  }
  if (isContentlessPackageDir(resolved)) {
    return { name, resolved, status: 'contentless' };
  }
  return { name, resolved, status: 'ok' };
}

export function checkPnpmInstallIntegrity(root, { names = null } = {}) {
  const declared = names && names.length ? names : collectDeclaredDependencyNames(root);
  const findings = declared.map((name) => inspectDeclaredDependency(root, name));
  return {
    ok: findings.every((item) => item.status !== 'contentless'),
    findings,
  };
}

function main(argv = process.argv.slice(2)) {
  const root = resolve(argValue(argv, '--root', DEFAULT_ROOT));
  const namesArg = argValue(argv, '--name', '');
  const names = namesArg ? [namesArg] : null;
  const report = checkPnpmInstallIntegrity(root, { names });
  const broken = report.findings.filter((item) => item.status === 'contentless');
  if (broken.length) {
    console.error(
      `[check-pnpm-install-integrity] ${broken.length} declared dependenc${broken.length === 1 ? 'y' : 'ies'} resolved to an empty or contentless directory:`
    );
    for (const item of broken) console.error(`  ${item.name} -> ${item.resolved}`);
    console.error('pnpm install can exit 0 in this case. Reinstall the broken package(s).');
    process.exitCode = 1;
    return report;
  }
  const checked = report.findings.filter((item) => item.status === 'ok').length;
  console.log(
    `[check-pnpm-install-integrity] ${checked} declared node_modules packages have contents.`
  );
  process.exitCode = 0;
  return report;
}

function isMainModule() {
  const entry = process.argv[1];
  if (!entry) return false;
  return (
    resolve(entry).replace(/\\/gu, '/').toLowerCase() ===
    fileURLToPath(import.meta.url)
      .replace(/\\/gu, '/')
      .toLowerCase()
  );
}

if (isMainModule()) {
  main();
}
