#!/usr/bin/env node
/**
 * Verifies that intentional historical npm package names carry the deprecation
 * messages recorded in scripts/holo-ci/npm-deprecation-manifest.json.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
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
    : join(ROOT, 'scripts', 'holo-ci', 'npm-deprecation-manifest.json');
const NPM_BIN = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function npmViewDeprecated(name, version) {
  const spec = `${name}@${version}`;
  try {
    const stdout = execFileSync(
      NPM_BIN,
      ['view', spec, 'deprecated', '--json', '--registry=https://registry.npmjs.org/'],
      {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      }
    ).trim();
    if (!stdout) return '';
    const parsed = JSON.parse(stdout);
    return typeof parsed === 'string' ? parsed : '';
  } catch (error) {
    const detail = `${error.stderr || ''}${error.stdout || ''}${error.message || ''}`;
    return { error: detail.slice(0, 1200) };
  }
}

const errors = [];
const rows = [];

if (!existsSync(MANIFEST)) {
  errors.push(`manifest missing: ${MANIFEST}`);
} else {
  const manifest = readJson(MANIFEST);
  for (const entry of manifest.deprecations || []) {
    const actual = npmViewDeprecated(entry.name, entry.version);
    const row = {
      name: entry.name,
      version: entry.version,
      replacement: entry.replacement,
      ok: actual === entry.message,
    };
    rows.push(row);
    if (actual?.error) {
      errors.push(`${entry.name}@${entry.version}: npm view failed: ${actual.error}`);
    } else if (actual !== entry.message) {
      errors.push(
        `${entry.name}@${entry.version}: deprecation mismatch. expected=${JSON.stringify(
          entry.message
        )} actual=${JSON.stringify(actual)}`
      );
    }
  }
}

const output = { ok: errors.length === 0, rows, errors };
if (JSON_OUT) {
  console.log(JSON.stringify(output, null, 2));
} else {
  for (const row of rows) {
    console.log(
      `[npm-deprecations] ${row.ok ? 'OK' : 'FAIL'} ${row.name}@${row.version} -> ${row.replacement}`
    );
  }
  if (errors.length) {
    console.error(`[npm-deprecations] FAIL: ${errors.length} issue(s)`);
    for (const error of errors) console.error(`  - ${error}`);
  } else {
    console.log('[npm-deprecations] PASS: registry deprecations match the manifest.');
  }
}

process.exit(errors.length === 0 ? 0 : 1);
