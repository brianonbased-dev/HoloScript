#!/usr/bin/env node
/**
 * qec-decode-bench.mjs — real-hardware benchmark for the graduated {@link QECDecoder}.
 *
 * Drives the SAME class the package ships (dist/index.js) on the local GPU: validates
 * exhaustively over all 16 X-syndromes against the exact maximum-likelihood lookup, then
 * measures batched decode throughput, and writes a committed receipt to
 * benchmarks/qec-decode-benchmark.json.
 *
 * Anti-theatre (F.155): refuses to report a number unless the adapter vendor is a real GPU
 * (not the SwiftShader / mock fallback that still "passes"). Set QEC_ALLOW_ANY_GPU=1 only to
 * smoke-test the plumbing on a non-NVIDIA device (the receipt is then marked non-canonical).
 *
 *   node packages/snn-webgpu/scripts/qec-decode-bench.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../dist/index.js');
const OUT = path.resolve(HERE, '../benchmarks/qec-decode-benchmark.json');

async function main() {
  const { GPUContext, QECDecoder } = await import(pathToFileURL(DIST).href);

  const ctx = new GPUContext();
  await ctx.initialize();
  const info = ctx.adapter.info ?? {};
  const adapter = {
    vendor: info.vendor ?? ctx.capabilities.vendor,
    architecture: info.architecture ?? ctx.capabilities.architecture,
    device: info.device,
    description: info.description,
  };

  const realGpu = /nvidia|amd|intel|apple/i.test(adapter.vendor || '');
  if (!realGpu && process.env.QEC_ALLOW_ANY_GPU !== '1') {
    console.error(
      `ABORT: adapter vendor="${adapter.vendor}" is not a real GPU — refusing to report a mock/SwiftShader number (set QEC_ALLOW_ANY_GPU=1 to override for a plumbing smoke test).`
    );
    process.exit(3);
  }

  const decoder = new QECDecoder(ctx);
  await decoder.initialize();

  // ── CORRECTNESS: exhaustive over all 16 X-syndromes, GPU BP + host OSD-0 ──
  const correctness = await decoder.validateExhaustive();

  // ── THROUGHPUT: ~1.05M decodes/dispatch, 30 reps on the real device ──
  const throughput = await decoder.benchmarkThroughput(1 << 20, 30);

  const receipt = {
    schema: 'qec-gpu-decode-benchmark/v1',
    source: '@holoscript/snn-webgpu QECDecoder (graduated from research/qec-decoder-probe)',
    code: '[[9,1,3]] rotated surface, X-graph min-sum BP (pure, GPU) + host OSD-0 fallback',
    real_gpu: realGpu,
    canonical: realGpu,
    adapter,
    correctness: {
      syndromes_tested: correctness.syndromesTested,
      gpu_bp_converged: correctness.gpuBpConverged,
      gpu_converged_all_valid_coset: correctness.gpuConvergedAllValidCoset,
      full_pipeline_all16_valid_coset: correctness.fullPipelineAll16ValidCoset,
      converged_flag_matches_cpu_bp: correctness.convergedFlagMatchesCpu,
      note: 'GPU runs pure BP; the syndromes BP cannot converge (matching CPU exactly) fall to host OSD-0 — the standard BP-on-accelerator / OSD-on-host split. Correctness = (a) every GPU-converged syndrome is exact-ML-coset-correct, (b) the full pipeline solves all 16.',
    },
    throughput: {
      batch_size: throughput.batchSize,
      reps: throughput.reps,
      total_decodes: throughput.totalDecodes,
      wall_seconds: throughput.wallSeconds,
      decodes_per_second: throughput.decodesPerSecond,
      ns_per_decode_amortized: throughput.nsPerDecodeAmortized,
      gpu_fast_path_fraction: throughput.gpuFastPathFraction,
      note: 'Amortized GPU compute over a batched dispatch (submit -> onSubmittedWorkDone), one thread per decode. Honest GPU metric = THROUGHPUT, not single-shot latency (one d3 decode is readback-bound). gpu_fast_path_fraction is the share fully handled on-GPU (rest need host OSD-0).',
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(
    JSON.stringify(
      {
        adapter,
        correctness: receipt.correctness,
        decodes_per_second: throughput.decodesPerSecond,
        ns_per_decode_amortized: throughput.nsPerDecodeAmortized,
        gpu_fast_path_fraction: throughput.gpuFastPathFraction,
        receipt: OUT,
      },
      null,
      2
    )
  );
  process.exit(0); // Dawn keeps the event loop alive otherwise
}

main().catch((e) => {
  console.error('QEC_BENCH_ERROR:', e.message, e.stack);
  process.exit(1);
});
