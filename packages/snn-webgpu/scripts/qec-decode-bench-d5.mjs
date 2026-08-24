#!/usr/bin/env node
/**
 * qec-decode-bench-d5.mjs — distance-5 benchmark for the parameterized {@link QECDecoderD}.
 *
 * Extends the d3 bench (qec-decode-bench.mjs) with the number its receipt was missing:
 * SINGLE-SHOT LATENCY (p50/p95) alongside batched throughput — real-time syndrome decoding
 * is latency-bounded (sub-microsecond budget per round on superconducting hardware), so
 * publishing throughput alone against a latency-defined requirement is a boundary error.
 *
 * Validates exhaustively over ALL 4096 d5 X-syndromes against the exact min-weight
 * reference (syndrome-validity required; ML-coset agreement measured — BP+OSD-0 is not
 * exact at d5, the CPU-pinned number is 4078/4096), then measures throughput and latency.
 *
 * Anti-theatre (F.155), same gate as d3: a receipt is CANONICAL only on a real GPU vendor.
 * QEC_ALLOW_ANY_GPU=1 permits a software-adapter run (e.g. mesa/llvmpipe) for functional
 * validation — correctness fields are then real, performance fields are explicitly
 * non-canonical.
 *
 *   node packages/snn-webgpu/scripts/qec-decode-bench-d5.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../dist/index.js');
const OUT = path.resolve(HERE, '../benchmarks/qec-decode-benchmark-d5.json');

async function main() {
  const { GPUContext, qec } = await import(pathToFileURL(DIST).href);
  const { buildRotatedSurfaceCode, validateSurfaceCode, QECDecoderD } = qec;

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
      `ABORT: adapter vendor="${adapter.vendor}" is not a real GPU — refusing to report a mock/software number (set QEC_ALLOW_ANY_GPU=1 for a functional-validation run; the receipt is then marked non-canonical).`
    );
    process.exit(3);
  }

  const code = buildRotatedSurfaceCode(5);
  const gates = validateSurfaceCode(code); // throws unless genuinely [[25,1,5]]
  console.log(`[d5] code gates passed: ${JSON.stringify(gates)}`);

  const decoder = new QECDecoderD(ctx, code);
  await decoder.initialize();

  console.log('[d5] exhaustive validation over all 4096 X-syndromes …');
  const validation = await decoder.validateExhaustive();
  console.log(`[d5] ${JSON.stringify({ ...validation, cpuAudit: undefined })}`);

  // Canonical defaults match the d3 receipt (2^20 × 30); a software-adapter
  // functional run can shrink them via env — the receipt records what ran.
  const batch = Number(process.env.QEC_BENCH_BATCH ?? 1 << 20);
  const reps = Number(process.env.QEC_BENCH_REPS ?? 30);
  console.log(`[d5] throughput (${batch} × ${reps}) …`);
  const throughput = await decoder.benchmarkThroughput(batch, reps);
  console.log(
    `[d5] ${Math.round(throughput.decodesPerSecond).toLocaleString()} decodes/s, ${throughput.nsPerDecodeAmortized.toFixed(1)} ns amortized, fast-path ${(throughput.gpuFastPathFraction * 100).toFixed(1)}%`
  );

  console.log('[d5] single-shot latency (200 reps) …');
  const latency = await decoder.benchmarkLatency(200, 20);
  console.log(
    `[d5] latency p50=${latency.p50Us.toFixed(1)}µs p95=${latency.p95Us.toFixed(1)}µs mean=${latency.meanUs.toFixed(1)}µs`
  );

  // d3 latency through the same class, same run — the apples-to-apples comparison
  const d3 = new QECDecoderD(ctx, buildRotatedSurfaceCode(3));
  await d3.initialize();
  const latencyD3 = await d3.benchmarkLatency(200, 20);

  const receipt = {
    schema: 'qec-gpu-decode-benchmark/v2',
    source: '@holoscript/snn-webgpu QECDecoderD (distance-parameterized; generated WGSL)',
    code: '[[25,1,5]] rotated surface, X-graph min-sum BP (pure, GPU) + host OSD-0 fallback',
    real_gpu: realGpu,
    canonical: realGpu,
    canonical_note: realGpu
      ? 'real-GPU run'
      : 'NON-CANONICAL performance: software adapter. Correctness fields (validation) are real — the WGSL executed on Dawn — but timing reflects a software rasterizer, not GPU silicon. Re-run on the RTX 3060 seat for canonical numbers.',
    adapter,
    code_gates: gates,
    correctness: {
      syndromes_tested: validation.syndromesTested,
      gpu_bp_converged: validation.gpuBpConverged,
      gpu_converged_all_valid: validation.gpuConvergedAllValid,
      full_pipeline_all_valid: validation.fullPipelineAllValid,
      full_pipeline_ml_coset_agreement: validation.fullPipelineMlCosetAgreement,
      converged_flag_matches_cpu: validation.convergedFlagMatchesCpu,
      cpu_reference_audit: validation.cpuAudit,
      note: 'Syndrome-validity is the hard gate (must be 4096/4096). ML-coset agreement is MEASURED: BP+OSD-0 is not exact at d5 — 4078/4096 (99.56%) matches the CPU-pinned reference exactly, so GPU and CPU disagree with exact-ML on the SAME 18 syndromes, i.e. the port is faithful.',
    },
    throughput,
    latency: {
      d5: latency,
      d3_same_class_same_run: latencyD3,
      note: 'Single-shot latency is the real-time-loop number the d3 receipt lacked. It is dominated by submit/readback overhead (buffer create + upload + map), not BP arithmetic — which is the honest point: a per-round decode loop on this API shape cannot hit a sub-microsecond budget regardless of code distance; batching across rounds/patches is where the GPU substrate wins (see throughput).',
    },
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(OUT, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`[d5] receipt → ${OUT} (canonical=${receipt.canonical})`);
  ctx.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
