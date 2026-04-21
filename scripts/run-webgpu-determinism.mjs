#!/usr/bin/env node
/**
 * Paper-3 WebGPU determinism harness — **mock artifact** smoke (no GPU, no WGSL).
 * For real cross-adapter runs: clear WEBGPU_HARNESS_MOCK and use the browser workflow
 * (WGSL kernel + adapter still TODO — see packages/engine/src/testing/WebGPUDeterminismHarness.ts).
 *
 * Usage (repo root):
 *   node scripts/run-webgpu-determinism.mjs
 *   pnpm webgpu:determinism:mock
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const runner = join(root, 'packages', 'engine', 'src', 'testing', 'run-webgpu-determinism-mock.ts');

const r = spawnSync('pnpm', ['exec', 'tsx', runner], {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, WEBGPU_HARNESS_MOCK: '1' },
});

process.exit(r.status ?? 1);
