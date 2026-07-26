#!/usr/bin/env node
/**
 * Build the signed HoloQR release APK (immersive MR / android-mr).
 *
 * The shipping path is fail-closed on HoloScript authorship:
 *   scanner.holo + worlds/*.holo -> QuestCompiler -> android-mr -> golden-diff gate
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
import { existsSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSigningEnv } from './resolve-signing-secrets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const appDir = join(here, '..');
const repoRoot = join(appDir, '..', '..');
const androidDir = join(appDir, 'android-mr');
const generatorPath = join(appDir, 'generate-native.mts');
const sourceGatePath = join(
  repoRoot,
  'scripts',
  'holo-ci',
  'check-quest-mr-emit-matches-reference.mts'
);
const require = createRequire(import.meta.url);
const defaultTsxCliPath = require.resolve('tsx/cli');

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
    'compiling scanner.holo and worlds/*.holo through QuestCompiler',
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

  const { ok, env: signingEnv, materialized } = await resolveSigningEnv();
  if (!ok) {
    console.error(
      'build-release: signing secrets unresolved. Provision them in HoloKey (see RELEASE.md), or pass\n' +
        '  KEYSTORE_PASSWORD / KEY_PASSWORD / KEY_ALIAS / ANDROID_KEYSTORE_B64 (or KEYSTORE_FILE) in env.'
    );
    process.exitCode = 2;
    return;
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
