#!/usr/bin/env node
/**
 * Paper 6 GPU capture wrapper.
 *
 * Browser WebGPU captures require a graphics/Vulkan-capable runtime. Vast SSH
 * containers can expose CUDA/NVML while keeping NVIDIA_DRIVER_CAPABILITIES at
 * compute,utility, which makes Chromium fall back to null/SwiftShader adapters.
 * This wrapper fails fast in that runtime and otherwise routes to the current
 * Paper 6 publication runner.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { platform, release } from 'node:os';

const DEFAULT_OUT = '.bench-logs/paper-6-gpu-bench.json';
const FORCE_GPU_ARG = '--force_high_performance_gpu';

function parseArgs(argv) {
  const out = {
    out: process.env.PAPER6_OUT || DEFAULT_OUT,
    strictAdapter: true,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (!raw.startsWith('--')) continue;
    const [flag, inline] = raw.slice(2).split('=', 2);
    const value = inline ?? argv[i + 1];
    if (inline === undefined && value && !value.startsWith('--')) i += 1;
    if (flag === 'out') out.out = value || DEFAULT_OUT;
    if (flag === 'no-strict-adapter') out.strictAdapter = false;
    if (flag === 'help') out.help = true;
  }
  return out;
}

function usage() {
  return [
    'Usage: node packages/engine/run-paper6-gpu-capture.mjs [options]',
    '',
    'Options:',
    '  --out=PATH             artifact path (default .bench-logs/paper-6-gpu-bench.json)',
    '  --no-strict-adapter    skip compute-only runtime preflight',
  ].join('\n');
}

function chromiumArgsWithHighPerformanceGpu() {
  const existing = process.env.BENCH_CHROMIUM_ARGS || '';
  if (existing.includes(FORCE_GPU_ARG)) return existing;
  return `${existing} ${FORCE_GPU_ARG}`.trim();
}

function nvidiaCapabilities() {
  return (process.env.NVIDIA_DRIVER_CAPABILITIES || '').toLowerCase();
}

function isComputeOnlyBrowserRuntime() {
  if (process.env.PAPER6_FORCE_COMPUTE_ONLY_PREFLIGHT === '1') return true;
  if (process.platform !== 'linux') return false;
  const caps = nvidiaCapabilities();
  if (!caps) return false;
  if (caps.includes('all')) return false;
  const graphicsCaps = ['graphics', 'display', 'video'];
  return !graphicsCaps.some((cap) => caps.includes(cap));
}

function writePreflightArtifact(outPath, reason) {
  const artifact = {
    schema_version: 'paper-6-gpu-capture-preflight-v1',
    benchmark: 'paper-6-mecanim-divergence',
    status: 'aborted_runtime_preflight',
    runner: 'packages/engine/run-paper6-gpu-capture.mjs',
    paper_ref: 'ai-ecosystem/research/paper-6-animation-sca.tex',
    ran_at: new Date().toISOString(),
    platform: `${platform()} ${release()}`,
    strict_adapter: true,
    nvidia_driver_capabilities: process.env.NVIDIA_DRIVER_CAPABILITIES || null,
    bench_chromium_args: chromiumArgsWithHighPerformanceGpu(),
    reason,
    next_route:
      'Run this capture on an owned/local Windows RTX rig, or use a Vast template whose vulkaninfo reports the NVIDIA adapter before launching Chromium.',
  };
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

function runPublicationRunner(root, outPath) {
  const runner = resolve(
    root,
    'packages',
    'engine',
    'src',
    'animation',
    'paper',
    'benchmarks',
    'p6-gpu-publication.ts'
  );
  const env = {
    ...process.env,
    BENCH_CHROMIUM_ARGS: chromiumArgsWithHighPerformanceGpu(),
    PAPER6_OUT: outPath,
  };
  const result = spawnSync('pnpm', ['exec', 'tsx', runner, '--out', outPath], {
    cwd: root,
    env,
    stdio: 'inherit',
    shell: true,
  });
  return result.status ?? 1;
}

export async function main(argv = process.argv.slice(2), config = {}) {
  const options = parseArgs(argv);
  if (options.help) {
    console.log(usage());
    return 0;
  }

  const root = config.cwd || resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const outPath = resolve(root, options.out);

  if (options.strictAdapter && isComputeOnlyBrowserRuntime()) {
    const caps = process.env.NVIDIA_DRIVER_CAPABILITIES || '(unset)';
    const artifact = writePreflightArtifact(
      outPath,
      `Browser WebGPU capture blocked: NVIDIA_DRIVER_CAPABILITIES=${caps} exposes compute-only runtime to Chromium.`
    );
    console.error(`[paper-6-gpu-capture] ${artifact.reason}`);
    console.log(`-> ${outPath}`);
    return 0;
  }

  if (process.platform === 'win32') {
    console.error(
      `[paper-6-gpu-capture] local Windows route; Chromium args include ${FORCE_GPU_ARG}`
    );
  }
  return runPublicationRunner(root, outPath);
}

const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === thisFile) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      console.error('[paper-6-gpu-capture] fatal', err);
      process.exit(1);
    }
  );
}
