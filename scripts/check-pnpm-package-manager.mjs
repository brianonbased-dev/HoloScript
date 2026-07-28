#!/usr/bin/env node
/**
 * Fail before a non-pinned pnpm can mutate the HoloScript install or lockfile.
 *
 * The packageManager field is the source of truth for the package manager
 * version. When this script runs under pnpm lifecycle/script execution, pnpm
 * exposes its active version in npm_config_user_agent. A mismatched active
 * version means the command was launched through the wrong pnpm binary.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = resolve(__dirname, '..');

function argValue(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function readExpectedVersion(root) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const match = String(packageJson.packageManager || '').match(/^pnpm@(.+)$/u);
  if (!match) {
    throw new Error(`package.json packageManager must pin pnpm, got ${packageJson.packageManager}`);
  }
  return match[1];
}

function parsePnpmUserAgent(userAgent) {
  const match = String(userAgent || '').match(/\bpnpm\/([^\s]+)/u);
  return match?.[1] || null;
}

function commandLine(command, args) {
  return [command, ...args].join(' ');
}

function commandVersion(command, args, cwd) {
  const result =
    process.platform === 'win32'
      ? spawnSync(commandLine(command, args), {
          cwd,
          encoding: 'utf8',
          timeout: 15000,
          windowsHide: true,
          shell: true,
        })
      : spawnSync(command, args, {
          cwd,
          encoding: 'utf8',
          timeout: 15000,
          windowsHide: true,
        });
  if (result.status !== 0) return null;
  return (
    String(result.stdout || '')
      .trim()
      .split(/\r?\n/u)[0] || null
  );
}

function fail(message) {
  console.error(`[check-pnpm-package-manager] FAIL ${message}`);
  process.exit(1);
}

const root = resolve(argValue('--root', DEFAULT_ROOT));
const expected = readExpectedVersion(root);
const active = parsePnpmUserAgent(process.env.npm_config_user_agent);

if (active && active !== expected) {
  fail(
    `active pnpm ${active} does not match packageManager pnpm@${expected}. ` +
      'Use `corepack pnpm ...` or repair the Codex pnpm shim before running install/build commands.'
  );
}

const skipProbes = process.env.HOLOSCRIPT_PNPM_GUARD_SKIP_PROBES === '1';

if (skipProbes) {
  if (active === expected) {
    console.log(`[check-pnpm-package-manager] active pnpm ${active} matches packageManager.`);
  } else {
    console.log(
      `[check-pnpm-package-manager] packageManager expects pnpm ${expected}; ` +
        'no active pnpm user agent was present, so lifecycle enforcement was not applicable.'
    );
  }
  process.exit(0);
}

const corepackVersion = skipProbes ? null : commandVersion('corepack', ['pnpm', '--version'], root);
const bareVersion = skipProbes ? null : commandVersion('pnpm', ['--version'], root);

if (!corepackVersion) {
  fail(
    'corepack pnpm --version did not resolve. Repair Corepack before running HoloScript scripts.'
  );
}

if (corepackVersion && corepackVersion !== expected) {
  fail(
    `corepack pnpm resolves ${corepackVersion}, expected ${expected}. ` +
      'Run `corepack prepare pnpm@' +
      expected +
      ' --activate` or reinstall the Codex node shims.'
  );
}

if (bareVersion && bareVersion !== expected) {
  fail(
    `bare pnpm resolves ${bareVersion}, expected ${expected}. ` +
      'Repair the Codex pnpm shim so plain `pnpm` delegates through Corepack.'
  );
}

if (active === expected) {
  console.log(
    `[check-pnpm-package-manager] active pnpm ${active}, corepack pnpm ${corepackVersion}, ` +
      'and bare pnpm resolution match packageManager.'
  );
  process.exit(0);
}

console.log(
  `[check-pnpm-package-manager] corepack pnpm ${corepackVersion} matches packageManager; ` +
    (bareVersion ? `bare pnpm ${bareVersion} also matches.` : 'bare pnpm was not present on PATH.')
);
