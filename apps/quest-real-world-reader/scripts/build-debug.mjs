#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appDirectory = resolve(here, '..');
const repoRoot = resolve(appDirectory, '..', '..');
const androidDirectory = join(appDirectory, 'android-mr');
const tsx = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const generator = join(appDirectory, 'generate-native.mts');
const gate = join(appDirectory, 'check-born-from-source.mts');
const wrapper = join(
  repoRoot,
  'apps',
  'quest-universal-qr-scanner',
  'android-mr',
  process.platform === 'win32' ? 'gradlew.bat' : 'gradlew'
);

function run(label, command, args, options = {}) {
  console.log(`holoread-build: ${label}`);
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: true,
    ...options,
  });
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    process.exit(result.status ?? 1);
  }
}

run('materializing reader.holo and reader-lifecycle.hsplus', process.execPath, [tsx, generator]);
run('verifying born-from-source output', process.execPath, [tsx, gate]);

const gradleArgs = [
  '/c',
  wrapper,
  '-p',
  androidDirectory,
  ':app:assembleDebug',
  '--console=plain',
  '--no-daemon',
];
if (process.platform === 'win32') {
  run('assembling debug APK', 'cmd.exe', gradleArgs, { cwd: androidDirectory });
} else {
  run(
    'assembling debug APK',
    wrapper,
    ['-p', androidDirectory, ':app:assembleDebug', '--console=plain', '--no-daemon'],
    { cwd: androidDirectory }
  );
}
