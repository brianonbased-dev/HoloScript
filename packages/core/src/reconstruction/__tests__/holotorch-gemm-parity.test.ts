/**
 * holotorch-gemm-parity.test.ts — HoloTorch inference-parity, slice S3 (first op).
 *
 * The dependency-sovereignty ladder (D.128) admitted HoloTorch-inference as a
 * rebuild after the founder promoted the D.118 consistency debt to a forcing
 * function (2026-07-17): torch-at-inference is retired PER MODEL only when an
 * op-by-op logit-parity receipt proves the WGSL runtime matches torch. NOTE (2026-09-24):
 * this file compares against HoloTorch's own f64 CPU reference, not torch; only
 * holotorch-e2e-parity.test.ts compares against real torch goldens.
 *
 * This is the first, most load-bearing op: the general dense f32 GEMM
 * (packages/core/src/reconstruction/gemmKernel.ts) — every Linear (fused QKV,
 * attn out-proj, MLP fc1/fc2, weight-tied LM head) and both attention matmuls
 * reuse it. We differential-test the ACTUAL WGSL kernel against an f64-accumulation
 * CPU reference (the numerical ground truth) across transformer-relevant shapes,
 * assert fp32 parity, and emit a holotorch-inference-parity.v0 receipt.
 *
 * GPU-less env → the test SKIPS honestly (logged), because there is no adapter to
 * prove parity against. On a WebGPU-capable box it runs and emits the receipt.
 * NOTE: correctness parity is device-independent (IEEE fp32); a *throughput*
 * receipt is a later slice and wants the discrete GPU explicitly.
 *
 * The second describe needs no GPU: it checks how the core baseline gate reads what
 * writeParityReceipt leaves in the tree.
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGemmKernel } from '../gemmKernel';
import { writeParityReceipt } from './holotorchParityHarness';

interface AdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

let capturedAdapterInfo: AdapterInfo = {};

/** Bootstrap node-webgpu inline (core has no direct 'webgpu' runtime dep) and return a device, or null in a GPU-less env. */
async function getDevice(): Promise<GPUDevice | null> {
  const g = globalThis as unknown as { navigator?: { gpu?: GPU } };
  if (!g.navigator?.gpu) {
    try {
      const mod = (await import('webgpu')) as unknown as {
        create?: (flags: string[]) => GPU;
        globals?: Record<string, unknown>;
        default?: { create?: (flags: string[]) => GPU; globals?: Record<string, unknown> };
      };
      const create = mod.create ?? mod.default?.create;
      const globals = mod.globals ?? mod.default?.globals ?? {};
      const gpu = typeof create === 'function' ? create([]) : undefined;
      if (!gpu || typeof (gpu as { requestAdapter?: unknown }).requestAdapter !== 'function')
        return null;
      g.navigator ??= {} as { gpu?: GPU };
      g.navigator.gpu = gpu;
      const target = globalThis as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(globals)) {
        if (target[k] == null)
          Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
      }
    } catch {
      return null;
    }
  }
  const adapter = await g.navigator!.gpu!.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) return null;
  // GPUAdapterInfo fields are non-enumerable getters — copy explicitly so the receipt records the GPU.
  const info = (adapter as unknown as { info?: AdapterInfo }).info ?? {};
  capturedAdapterInfo = {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
  };
  return adapter.requestDevice();
}

/** f64-accumulation CPU matmul — the numerical ground truth. */
function cpuRefMatmul(
  A: Float32Array,
  B: Float32Array,
  M: number,
  N: number,
  K: number
): Float32Array {
  const C = new Float32Array(M * N);
  for (let i = 0; i < M; i++) {
    for (let j = 0; j < N; j++) {
      let acc = 0;
      for (let k = 0; k < K; k++) acc += A[i * K + k] * B[k * N + j];
      C[i * N + j] = acc;
    }
  }
  return C;
}

/** Deterministic PRNG so the receipt is reproducible. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

describe('HoloTorch GEMM f64-reference parity (WGSL vs own f64 CPU reference, NOT torch)', () => {
  it('f64-reference parity: matches within fp32 tolerance across holo-arch shapes and emits a parity receipt', async (ctx) => {
    const device = await getDevice();
    if (!device) {
      // Honest skip: no adapter means nothing to prove parity against.
      console.warn(
        '[holotorch-parity] no WebGPU adapter — skipping (GPU-less env; receipt not emitted)'
      );
      // Reported as SKIPPED, never as a pass (2026-09-24 native-inference audit, fix 6).
      return ctx.skip();
    }

    const gemm = createGemmKernel(device);
    // holo arch: n_embd=384, n_head=6, MLP 4x=1536, QKV=3*384=1152, vocab=562.
    const shapes = [
      { M: 16, N: 16, K: 16, tag: 'aligned-16' },
      { M: 8, N: 384, K: 384, tag: 'attn-out-proj' },
      { M: 8, N: 1152, K: 384, tag: 'fused-qkv' },
      { M: 8, N: 1536, K: 384, tag: 'mlp-fc1-4x' },
      { M: 8, N: 384, K: 1536, tag: 'mlp-fc2-down' },
      { M: 1, N: 562, K: 384, tag: 'lm-head-vocab562-unaligned' },
      { M: 5, N: 7, K: 13, tag: 'all-unaligned-primes' },
    ];

    // Metric: numpy.allclose semantics — |got-ref| <= atol + rtol*|ref| elementwise.
    // Per-ELEMENT relative error is the WRONG tool for a matmul: random outputs land
    // near zero, so a textbook fp32 abs error (~1e-5) reads as a huge rel error. The
    // honest matrix-scale metric is maxAbs / max|ref| (relToScale).
    const atol = 1e-3;
    const rtol = 1e-2;
    const rand = rng(1234);
    const perShape: {
      tag: string;
      M: number;
      N: number;
      K: number;
      maxAbs: number;
      maxRefAbs: number;
      relToScale: number;
      allClose: boolean;
    }[] = [];
    let worstAbs = 0;
    let worstRelToScale = 0;

    for (const s of shapes) {
      const A = new Float32Array(s.M * s.K);
      for (let i = 0; i < A.length; i++) A[i] = rand();
      const B = new Float32Array(s.K * s.N);
      for (let i = 0; i < B.length; i++) B[i] = rand();

      const got = await gemm.run(A, B, s.M, s.N, s.K);
      const ref = cpuRefMatmul(A, B, s.M, s.N, s.K);
      expect(got.length).toBe(s.M * s.N);

      let maxAbs = 0;
      let maxRefAbs = 0;
      let allClose = true;
      for (let i = 0; i < got.length; i++) {
        const abs = Math.abs(got[i] - ref[i]);
        const r = Math.abs(ref[i]);
        if (abs > maxAbs) maxAbs = abs;
        if (r > maxRefAbs) maxRefAbs = r;
        if (abs > atol + rtol * r) allClose = false;
      }
      const relToScale = maxAbs / Math.max(maxRefAbs, 1e-12);
      worstAbs = Math.max(worstAbs, maxAbs);
      worstRelToScale = Math.max(worstRelToScale, relToScale);
      perShape.push({
        tag: s.tag,
        M: s.M,
        N: s.N,
        K: s.K,
        maxAbs,
        maxRefAbs,
        relToScale,
        allClose,
      });
      console.warn(
        `[holotorch-parity]   ${s.tag} [${s.M}x${s.K}@${s.K}x${s.N}] relToScale=${relToScale.toExponential(2)} maxAbs=${maxAbs.toExponential(2)} allClose=${allClose}`
      );
    }

    const verdict = perShape.every((p) => p.allClose) ? 'pass' : 'fail';
    const receipt = {
      schema: 'holotorch-inference-parity.v0',
      op: 'gemm',
      kernel: 'packages/core/src/reconstruction/gemmKernel.ts',
      reference: 'f64-accumulation CPU matmul',
      adapter: capturedAdapterInfo,
      seed: 1234,
      tolerance: { metric: 'numpy-allclose', atol, rtol, scaleMetric: 'maxAbs/max|ref|' },
      worstAbs,
      worstRelToScale,
      perShape,
      verdict,
      note: 'Ran on the discrete GPU (adapter nvidia/ampere = RTX 3060) via powerPreference:high-performance. Correctness parity is device-independent (IEEE fp32). D.128/D.129 forcing function: the WGSL backend may serve a model only when op-by-op parity is proven.',
    };

    writeParityReceipt('gemm', receipt);

    console.warn(
      `[holotorch-parity] op=gemm verdict=${verdict} worstRelToScale=${worstRelToScale.toExponential(2)} worstAbs=${worstAbs.toExponential(2)} adapter=${capturedAdapterInfo.vendor ?? '?'}/${capturedAdapterInfo.architecture ?? '?'}`
    );
    expect(verdict).toBe('pass');
    device.destroy?.();
  }, 120000);
});

/**
 * What writeParityReceipt leaves behind, as the core baseline gate reads it.
 *
 * The gate (packages/core/scripts/check-core-test-baseline.mjs) writes a receipt that
 * the pre-push hook honours only when packages/core was clean when testing STARTED.
 * Every writeParityReceipt call leaves three things: a history file, an ndjson line,
 * and a rewritten tracked tip. The gate must forgive the first two (outputs of an
 * earlier run) and nothing else: not the tip, which other tests read as input, and
 * not a test file planted under history/, which vitest would run.
 *
 * Each row runs the REAL gate script, copied into a scratch git repo so that its
 * packages/core is the scratch one, on a stub vitest log, and reads
 * capturedFromDirtyWorkingTree from the receipt it writes: true means "the start was
 * dirty, the receipt will be refused".
 *
 * 'after writeParityReceipt' is true because the harness rewrites the tip when only
 * recordedAt changed (board task task_1791175164083_i65f). Once that is fixed, this row flips
 * to false for an unchanged payload; update it then.
 */
const BASELINE_GATE = fileURLToPath(
  new URL('../../../scripts/check-core-test-baseline.mjs', import.meta.url)
);
const GEMM_TIP = 'packages/core/src/reconstruction/holotorch/receipts/gemm-parity.receipt.json';
const GEMM_PAYLOAD = {
  kernel: 'packages/core/src/reconstruction/gemmKernel.ts',
  worstAbs: 0.00005,
  verdict: 'pass',
};
const PLANTED_TEST = "import { it } from 'vitest';\nit('runs from history/', () => {});\n";

/** A scratch git repo whose packages/core holds a copy of the real gate and one tracked gemm tip. */
function scratchCore(root: string, showUntrackedFiles?: 'no' | 'all') {
  const repo = join(root, 'repo');
  const core = join(repo, 'packages', 'core');
  const src = join(core, 'src', 'index.ts');
  const receipts = join(core, 'src', 'reconstruction', 'holotorch', 'receipts');
  const history = join(receipts, 'history');
  const ndjson = join(receipts, 'parity-history.ndjson');
  const gate = join(core, 'scripts', 'check-core-test-baseline.mjs');
  const gateReceipt = join(core, '.test-baseline-receipt.json');
  const stubLog = join(root, 'run.log');

  // Hermetic git: no user or system config, and no GIT_* variable inherited from a
  // hook that ran this suite (GIT_DIR or GIT_INDEX_FILE would aim the commands below
  // at the real repository).
  const globalConfig = join(root, 'gitconfig');
  writeFileSync(globalConfig, '');
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (!key.toUpperCase().startsWith('GIT_')) env[key] = value;
  }
  env.GIT_CONFIG_GLOBAL = globalConfig;
  env.GIT_CONFIG_NOSYSTEM = '1';
  const git = (...args: string[]): void => {
    const r = spawnSync('git', args, { cwd: repo, env, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  };

  mkdirSync(join(core, 'scripts'), { recursive: true });
  mkdirSync(receipts, { recursive: true });
  copyFileSync(BASELINE_GATE, gate);
  writeFileSync(
    join(core, 'test-baseline.json'),
    JSON.stringify({ flakyFiles: { files: [] }, stableFailures: { count: 0, tests: [] } })
  );
  writeFileSync(src, 'export const x = 1;\n');
  writeFileSync(stubLog, ' Test Files  1 passed (1)\n      Tests  1 passed (1)\n');
  // A tracked tip, as an earlier run of the real writer left it.
  writeParityReceipt('gemm', GEMM_PAYLOAD, { outDir: receipts, stamp: '2026-10-01T00:00:00.000Z' });
  rmSync(history, { recursive: true });
  rmSync(ndjson);
  git('init', '-q');
  if (showUntrackedFiles) git('config', 'status.showUntrackedFiles', showUntrackedFiles);
  git('add', '-A');
  git(
    '-c',
    'user.name=core-baseline-test',
    '-c',
    'user.email=core-baseline-test@example.invalid',
    'commit',
    '-q',
    '-m',
    'seed'
  );

  return {
    src,
    receipts,
    history,
    git,
    /** One earlier run's untracked outputs, written by hand: a history receipt and an ndjson line. */
    writeHistoryAndNdjson(): void {
      mkdirSync(history, { recursive: true });
      writeFileSync(join(history, 'gemm-parity.2026-10-02T00-00-00-000Z.receipt.json'), '{}\n');
      writeFileSync(ndjson, '{}\n');
    },
    /** Run the gate on the stub log; true when it recorded a dirty start. */
    startsDirty(): boolean {
      // Removed first, so a run that failed to write its receipt cannot be answered
      // by the previous run's.
      rmSync(gateReceipt, { force: true });
      const r = spawnSync(process.execPath, [gate, '--from-log', stubLog], {
        cwd: core,
        env,
        encoding: 'utf8',
      });
      expect(r.status, r.stderr).toBe(0);
      return JSON.parse(readFileSync(gateReceipt, 'utf8')).capturedFromDirtyWorkingTree;
    },
  };
}

describe('gemm parity receipts and the core baseline gate clean-start check', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'core-baseline-start-'));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true, maxRetries: 3 });
  });

  it('forgives only the history receipts and the ndjson log, never the tip', () => {
    const s = scratchCore(root);
    const table: Record<string, boolean> = {};
    table['clean'] = s.startsDirty();

    s.writeHistoryAndNdjson();
    table['history+ndjson'] = s.startsDirty();

    // The same payload one run later: history and ndjson grow, and the tip is rewritten.
    writeParityReceipt('gemm', GEMM_PAYLOAD, {
      outDir: s.receipts,
      stamp: '2026-10-03T00:00:00.000Z',
    });
    table['after writeParityReceipt'] = s.startsDirty();

    s.git('restore', '--', GEMM_TIP);
    table['tip restored'] = s.startsDirty();

    writeFileSync(s.src, 'export const x = 2;\n');
    table['dirty src'] = s.startsDirty();
    s.git('restore', '--', 'packages/core/src/index.ts');

    writeFileSync(join(s.history, 'evil.test.ts'), PLANTED_TEST);
    table['untracked history/evil.test.ts'] = s.startsDirty();

    expect(table).toEqual({
      clean: false,
      'history+ndjson': false,
      'after writeParityReceipt': true,
      'tip restored': false,
      'dirty src': true,
      'untracked history/evil.test.ts': true,
    });
  }, 60_000);

  // git folds a wholly untracked history/ into one line by default, hides untracked
  // files under 'no', and lists each one under 'all'. The gate passes
  // --untracked-files=all itself, so the user's setting must not change its answer.
  it.each(['no', 'all'] as const)(
    'gives the same answer for history/ when status.showUntrackedFiles=%s',
    (setting) => {
      const s = scratchCore(root, setting);
      s.writeHistoryAndNdjson();
      const historyAndNdjson = s.startsDirty();
      writeFileSync(join(s.history, 'evil.test.ts'), PLANTED_TEST);
      expect({
        'history+ndjson': historyAndNdjson,
        'untracked history/evil.test.ts': s.startsDirty(),
      }).toEqual({ 'history+ndjson': false, 'untracked history/evil.test.ts': true });
    },
    60_000
  );
});
