#!/usr/bin/env node
/**
 * Fail-closed HoloRead release build.
 *
 * Product source is compiled and byte-verified before signing is resolved or Gradle may run.
 * Signing secrets are reused through HoloQR's HoloKey-aware resolver and never printed.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSigningEnv } from '../../quest-universal-qr-scanner/scripts/resolve-signing-secrets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(here, '..');
const repoRoot = resolve(appDirectory, '..', '..');
const androidDirectory = join(appDirectory, 'android-mr');
const tsx = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const generator = join(appDirectory, 'generate-native.mts');
const gate = join(appDirectory, 'check-born-from-source.mts');
const signingProperties = join(androidDirectory, 'keystore.properties');
const requiredSigningProperties = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'];
const wrapper = join(
  repoRoot,
  'apps',
  'quest-universal-qr-scanner',
  'android-mr',
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
);

function run(label, command, args, options = {}) {
  console.log(`holoread-release: ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    return { ok: false, status: result.status ?? 1 };
  }
  return { ok: true, status: 0 };
}

export function runHoloScriptSourceGate() {
  const generated = run('compiling HoloScript product sources', process.execPath, [tsx, generator]);
  if (!generated.ok) return generated;
  return run('verifying byte-identical native output', process.execPath, [tsx, gate]);
}

export function hasCompleteSigningProperties(content) {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const equals = line.indexOf('=');
    if (equals <= 0) continue;
    values.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
  }
  return requiredSigningProperties.every((key) => Boolean(values.get(key)));
}

export async function main(argv = process.argv.slice(2)) {
  const sourceGate = runHoloScriptSourceGate();
  if (!sourceGate.ok) {
    process.exitCode = sourceGate.status;
    return;
  }
  if (argv.includes('--source-gate-only')) {
    console.log('holoread-release: source gate passed; signing and Gradle were not run.');
    return;
  }

  let resolved = { ok: true, materialized: null, env: {} };
  if (
    existsSync(signingProperties) &&
    hasCompleteSigningProperties(readFileSync(signingProperties, 'utf8'))
  ) {
    console.log(
      'holoread-release: using complete gitignored signing properties (values redacted).'
    );
  } else {
    resolved = await resolveSigningEnv();
    if (!resolved.ok) {
      console.error('holoread-release: signing secrets unresolved; release build blocked.');
      process.exitCode = 2;
      return;
    }
  }

  const gradleArgs =
    process.platform === 'win32'
      ? [
          '/c',
          wrapper,
          '-p',
          androidDirectory,
          ':app:testDebugUnitTest',
          ':app:assembleRelease',
          '--console=plain',
          '--no-daemon',
        ]
      : [
          '-p',
          androidDirectory,
          ':app:testDebugUnitTest',
          ':app:assembleRelease',
          '--console=plain',
          '--no-daemon',
        ];

  try {
    const built = run(
      'assembling signed release APK',
      process.platform === 'win32' ? 'cmd.exe' : wrapper,
      gradleArgs,
      { cwd: androidDirectory, env: { ...process.env, ...resolved.env } }
    );
    process.exitCode = built.status;
  } finally {
    if (resolved.materialized && existsSync(resolved.materialized)) {
      unlinkSync(resolved.materialized);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
