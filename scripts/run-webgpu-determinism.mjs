#!/usr/bin/env node
/**
 * Paper-3 WebGPU determinism harness driver.
 *
 * Default mode runs real browser WebGPU evidence through Playwright. Mock mode
 * is still available for wiring checks, but it fails if requested as
 * production evidence.
 *
 * Usage:
 *   node scripts/run-webgpu-determinism.mjs
 *   node scripts/run-webgpu-determinism.mjs --mock
 *   node scripts/run-webgpu-determinism.mjs --production-evidence --replications 5
 */
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function hasFlag(name) {
  return args.includes(name);
}

function argValue(name, defaultValue) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) {
    return defaultValue;
  }
  return args[index + 1];
}

function run(command, commandArgs, env = {}) {
  const executable = process.platform === 'win32' && command === 'pnpm' ? 'cmd.exe' : command;
  const args =
    process.platform === 'win32' && command === 'pnpm'
      ? ['/d', '/s', '/c', 'pnpm.cmd', ...commandArgs]
      : commandArgs;
  const result = spawnSync(executable, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });
  if (result.error) {
    console.error(`[webgpu-determinism] failed to spawn ${command}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const mockMode = hasFlag('--mock') || process.env.WEBGPU_HARNESS_MOCK === '1';
const productionEvidence =
  hasFlag('--production-evidence') ||
  (!mockMode &&
    !hasFlag('--no-production-evidence') &&
    process.env.WEBGPU_DETERMINISM_PRODUCTION !== '0');

if (mockMode && productionEvidence) {
  console.error(
    '[webgpu-determinism] refusing mock mode for a production evidence run. ' +
      'Clear WEBGPU_HARNESS_MOCK or pass --no-production-evidence for wiring-only smoke.',
  );
  process.exit(2);
}

if (mockMode) {
  const runner = join(root, 'packages', 'engine', 'src', 'testing', 'run-webgpu-determinism-mock.ts');
  run('pnpm', ['exec', 'tsx', runner], { WEBGPU_HARNESS_MOCK: '1' });
  process.exit(0);
}

const outputPath = resolve(
  root,
  argValue('--output', process.env.WEBGPU_DETERMINISM_OUTPUT_PATH ?? '.bench-logs/webgpu-determinism-harness.json'),
);
const replications = argValue('--replications', process.env.WEBGPU_DETERMINISM_REPLICATIONS ?? '2');
const nativeWebGpu = process.env.WEBGPU_DETERMINISM_NATIVE ?? '1';
const defaultAdapterTag = nativeWebGpu === '1' ? 'nvidia-rtx3060' : 'swiftshader';
const adapterTag = argValue('--adapter-tag', process.env.WEBGPU_DETERMINISM_ADAPTER_TAG ?? defaultAdapterTag);
const host = argValue('--host', process.env.WEBGPU_DETERMINISM_HOST ?? 'codex-hardware');
const protocolCommit = argValue('--protocol-commit', process.env.WEBGPU_DETERMINISM_PROTOCOL_COMMIT ?? 'local');

run('pnpm', ['--filter', '@holoscript/engine', 'run', 'build:webgpu-determinism-harness']);
run(
  'pnpm',
  ['--filter', '@holoscript/engine', 'exec', 'playwright', 'test', 'tests/webgpu-determinism.spec.ts'],
  {
    WEBGPU_DETERMINISM_OUTPUT_PATH: outputPath,
    WEBGPU_DETERMINISM_REPLICATIONS: replications,
    WEBGPU_DETERMINISM_ADAPTER_TAG: adapterTag,
    WEBGPU_DETERMINISM_HOST: host,
    WEBGPU_DETERMINISM_PROTOCOL_COMMIT: protocolCommit,
    WEBGPU_DETERMINISM_PRODUCTION: productionEvidence ? '1' : '0',
    WEBGPU_DETERMINISM_NATIVE: nativeWebGpu,
    WEBGPU_DETERMINISM_CAPTURE_FIELDS: process.env.WEBGPU_DETERMINISM_CAPTURE_FIELDS ?? '1',
  },
);
