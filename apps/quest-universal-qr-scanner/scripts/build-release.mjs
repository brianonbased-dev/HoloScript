#!/usr/bin/env node
/**
 * Build the SIGNED release APK for the Universal QR Scanner (immersive-MR / android-mr).
 *
 * Resolves the signing secrets from HoloKey (the wallet-keyed vault) — or process.env — via
 * resolve-signing-secrets.mjs, materializes the keystore to a private tmp file, runs
 * `gradlew assembleRelease`, and DELETES the keystore afterward (decrypted key never persists).
 *
 *   node scripts/build-release.mjs
 *
 * Requires: JDK 17 (JAVA_HOME) + Android SDK (ANDROID_HOME) in env (same as a normal gradle build).
 * Provision the signing secrets once (founder): RELEASE.md "Signing secrets (HoloKey)".
 */
import { spawnSync } from 'node:child_process';
import { unlinkSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveSigningEnv } from './resolve-signing-secrets.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const androidDir = join(here, '..', 'android-mr'); // the immersive-MR app project

const { ok, env: signingEnv, materialized } = await resolveSigningEnv();
if (!ok) {
  console.error(
    'build-release: signing secrets unresolved. Provision them in HoloKey (see RELEASE.md), or pass\n' +
      '  KEYSTORE_PASSWORD / KEY_PASSWORD / KEY_ALIAS / ANDROID_KEYSTORE_B64 (or KEYSTORE_FILE) in env.'
  );
  process.exit(2);
}

const isWin = process.platform === 'win32';
const gradlewPath = join(androidDir, isWin ? 'gradlew.bat' : 'gradlew');
// On Windows a .bat must run through cmd.exe; pass the ABSOLUTE path (cmd searches PATH, not cwd, for
// a bare name) and avoid shell:true (no arg-escaping deprecation). The gradle args have no spaces.
const cmd = isWin ? 'cmd.exe' : gradlewPath;
const args = isWin
  ? ['/c', gradlewPath, ':app:assembleRelease', '--console=plain', '--no-daemon']
  : [':app:assembleRelease', '--console=plain', '--no-daemon'];
try {
  const r = spawnSync(cmd, args, {
    cwd: androidDir,
    env: { ...process.env, ...signingEnv }, // secrets passed only to the child; never echoed to a shell
    stdio: 'inherit',
    windowsHide: true,
  });
  process.exitCode = r.status ?? 1;
} finally {
  if (materialized && existsSync(materialized)) {
    unlinkSync(materialized); // the decrypted keystore never outlives the build
  }
}
