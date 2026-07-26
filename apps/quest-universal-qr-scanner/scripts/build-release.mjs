#!/usr/bin/env node
/**
 * Build the signed HoloQR release APK (immersive MR / android-mr).
 *
 * The shipping path is fail-closed on HoloScript authorship:
 *   scanner.holo + scanner-lifecycle.hsplus + worlds/*.holo -> QuestCompiler -> android-mr -> gate
 *
 * Only after that source gate passes does this resolve signing secrets from HoloKey or process.env,
 * materialize the keystore to a private temporary file, run Gradle, and delete the keystore.
 *
 *   pnpm holoqr:build-release
 *   pnpm check:holoqr-born-from-source  # compiler + gate only; no signing or Gradle
 *
 * Requires JDK 17 and the Android SDK for a full release build.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSigningEnv } from './resolve-signing-secrets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const repoRoot = join(appDir, '..', '..');
const androidDir = join(appDir, 'android-mr');
const localSigningPropertiesPath = join(androidDir, 'keystore.properties');
const generatorPath = join(appDir, 'generate-native.mts');
const sourceGatePath = join(
  repoRoot,
  'scripts',
  'holo-ci',
  'check-quest-mr-emit-matches-reference.mts'
);
const require = createRequire(import.meta.url);
const defaultTsxCliPath = require.resolve('tsx/cli');
const requiredSigningPropertyKeys = ['storeFile', 'storePassword', 'keyAlias', 'keyPassword'];

export function hasCompleteSigningProperties(content) {
  const values = new Map();
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const equals = line.indexOf('=');
    if (equals <= 0) continue;
    values.set(line.slice(0, equals).trim(), line.slice(equals + 1).trim());
  }
  return requiredSigningPropertyKeys.every((key) => Boolean(values.get(key)));
}

function hasLocalSigningProperties() {
  if (!existsSync(localSigningPropertiesPath)) return false;
  return hasCompleteSigningProperties(readFileSync(localSigningPropertiesPath, 'utf8'));
}

function runStep(label, command, args, options, spawn = spawnSync, logger = console) {
  logger.log(`build-release: ${label}`);
  const result = spawn(command, args, options);
  if (result.error) {
    logger.error(`build-release: ${label} could not start: ${result.error.message}`);
    return { ok: false, status: 1 };
  }
  if (result.status !== 0) {
    logger.error(`build-release: ${label} failed; release build blocked.`);
    return { ok: false, status: result.status ?? 1 };
  }
  return { ok: true, status: 0 };
}

export function runHoloScriptSourceGate({
  spawn = spawnSync,
  nodePath = process.execPath,
  tsxCliPath = defaultTsxCliPath,
  stdio = 'inherit',
  logger = console,
} = {}) {
  const commonOptions = {
    cwd: repoRoot,
    stdio,
    windowsHide: true,
  };

  const generated = runStep(
    'compiling scanner.holo, scanner-lifecycle.hsplus, and worlds/*.holo through QuestCompiler',
    nodePath,
    [tsxCliPath, generatorPath],
    commonOptions,
    spawn,
    logger
  );
  if (!generated.ok) return generated;

  return runStep(
    'verifying compiler output against the native Quest reference',
    nodePath,
    [tsxCliPath, sourceGatePath],
    commonOptions,
    spawn,
    logger
  );
}

export async function main(argv = process.argv.slice(2)) {
  const sourceGate = runHoloScriptSourceGate();
  if (!sourceGate.ok) {
    process.exitCode = sourceGate.status;
    return;
  }

  if (argv.includes('--source-gate-only')) {
    console.log(
      'build-release: HoloQR born-from-source gate passed; signing and Gradle were not run.'
    );
    return;
  }

  let signingEnv = {};
  let materialized = null;
  if (hasLocalSigningProperties()) {
    console.log(
      'build-release: using complete gitignored android-mr/keystore.properties (values redacted).'
    );
  } else {
    const resolved = await resolveSigningEnv();
    if (!resolved.ok) {
      console.error(
        'build-release: signing secrets unresolved. Provision them in HoloKey (see RELEASE.md), pass\n' +
          '  KEYSTORE_PASSWORD / KEY_PASSWORD / KEY_ALIAS / ANDROID_KEYSTORE_B64 (or KEYSTORE_FILE),\n' +
          '  or provide a complete gitignored android-mr/keystore.properties.'
      );
      process.exitCode = 2;
      return;
    }
    signingEnv = resolved.env;
    materialized = resolved.materialized;
  }

  const isWin = process.platform === 'win32';
  const gradlewPath = join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
  // Windows batch files must run through cmd.exe. Pass the absolute path and avoid shell:true.
  const cmd = isWin ? 'cmd.exe' : gradlewPath;
  const args = isWin
    ? ['/c', gradlewPath, ':app:assembleRelease', '--console=plain', '--no-daemon']
    : [':app:assembleRelease', '--console=plain', '--no-daemon'];

  try {
    const result = spawnSync(cmd, args, {
      cwd: androidDir,
      env: { ...process.env, ...signingEnv },
      stdio: 'inherit',
      windowsHide: true,
    });
    process.exitCode = result.status ?? 1;
  } finally {
    if (materialized && existsSync(materialized)) {
      unlinkSync(materialized);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  await main();
}
