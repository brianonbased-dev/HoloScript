#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { arch, platform as osPlatform, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const VERSION = '0.3.0';
const PLATFORM = 'darwin-arm64';
const META_PACKAGE = '@holoscript/systems';
const PLATFORM_PACKAGE = '@holoscript/systems-darwin-arm64';

function valueAfter(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

function run(command, args, { cwd, env, capture = false, timeout = 600_000 } = {}) {
  const windowsCommand = process.platform === 'win32' && command === 'npm';
  const result = spawnSync(windowsCommand ? 'npm.cmd' : command, args, {
    cwd,
    env,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    shell: windowsCommand,
    timeout,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = capture ? String(result.stderr || result.stdout || '').trim() : '';
    throw new Error(
      `${command} ${args.join(' ')} exited ${result.status}${detail ? `: ${detail}` : ''}`
    );
  }
  return capture ? String(result.stdout || '').trim() : '';
}

function installedVersion(consumer, packageName) {
  const packagePath = join(consumer, 'node_modules', ...packageName.split('/'), 'package.json');
  if (!existsSync(packagePath)) throw new Error(`cold consumer did not install ${packageName}`);
  return JSON.parse(readFileSync(packagePath, 'utf8')).version;
}

async function main() {
  const args = process.argv.slice(2);
  const jsonOutput = args.includes('--json');
  const outputPath = valueAfter(args, '--out');
  const actualHost = `${osPlatform()}-${arch()}`;
  if (actualHost !== PLATFORM) {
    throw new Error(`public cold consumer requires ${PLATFORM}; running on ${actualHost}`);
  }

  const temp = mkdtempSync(join(tmpdir(), 'holoscript-systems-0.3-public-macos-'));
  try {
    const consumer = join(temp, 'consumer');
    const userConfig = join(temp, 'anonymous.npmrc');
    mkdirSync(consumer, { recursive: true });
    writeFileSync(userConfig, 'registry=https://registry.npmjs.org/\nalways-auth=false\n');
    const anonymousEnv = {
      ...process.env,
      NPM_TOKEN: '',
      NODE_AUTH_TOKEN: '',
      npm_config_userconfig: userConfig,
      npm_config_registry: 'https://registry.npmjs.org/',
      npm_config_always_auth: 'false',
    };
    run('npm', ['init', '-y'], { cwd: consumer, env: anonymousEnv, capture: true });
    run(
      'npm',
      [
        'install',
        '--ignore-scripts',
        '--package-lock=false',
        '--no-audit',
        '--no-fund',
        `${META_PACKAGE}@${VERSION}`,
      ],
      { cwd: consumer, env: anonymousEnv, capture: true }
    );

    const packagedEntry = join(
      consumer,
      'node_modules',
      '@holoscript',
      'systems',
      'conformance',
      'multi-file-modules',
      'entry.hs'
    );
    const executable = join(consumer, 'module-exit-five');
    run(
      process.execPath,
      [
        join(consumer, 'node_modules', '@holoscript', 'systems', 'bin', 'holoscriptc.cjs'),
        packagedEntry,
        '-o',
        executable,
      ],
      { cwd: consumer, env: anonymousEnv }
    );
    const execution = spawnSync(executable, [], {
      cwd: consumer,
      env: anonymousEnv,
      windowsHide: true,
    });
    if (execution.error) throw execution.error;
    if (execution.status !== 5) {
      throw new Error(`public macOS cold consumer exited ${execution.status}; expected 5`);
    }
    const receipt = {
      schema: 'holoscript.systems-0.3-public-macos-cold-consumer/v1',
      generatedAt: new Date().toISOString(),
      ok: true,
      platform: PLATFORM,
      actualHost,
      registry: 'https://registry.npmjs.org/',
      anonymous: true,
      repoLess: true,
      inputOrigin: 'packaged-conformance',
      packages: {
        [META_PACKAGE]: installedVersion(consumer, META_PACKAGE),
        [PLATFORM_PACKAGE]: installedVersion(consumer, PLATFORM_PACKAGE),
      },
      exitCode: execution.status,
    };
    if (
      receipt.packages[META_PACKAGE] !== VERSION ||
      receipt.packages[PLATFORM_PACKAGE] !== VERSION
    ) {
      throw new Error('public macOS cold consumer installed unexpected package versions');
    }
    const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
    if (outputPath) {
      const resolvedOutput = resolve(outputPath);
      mkdirSync(dirname(resolvedOutput), { recursive: true });
      writeFileSync(resolvedOutput, serialized);
    }
    if (jsonOutput) console.log(serialized.trim());
    else console.log(`[systems-0.3-public-macos] PASS ${META_PACKAGE}@${VERSION}`);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`[systems-0.3-public-macos] ${error.message}`);
  process.exitCode = 1;
});
