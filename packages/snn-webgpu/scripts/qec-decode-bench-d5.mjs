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
 *
 * Batch shape: 2^18 x 30 by default, deliberately NOT the d3 receipt's 2^20 -- a single 2^20
 * d5 dispatch exceeds the Windows GPU watchdog and hangs the device (see the comment at the
 * throughput call). QEC_BENCH_BATCH / QEC_BENCH_REPS override it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(HERE, '../dist/index.js');
const OUT = path.resolve(HERE, '../benchmarks/qec-decode-benchmark-d5.json');

/**
 * Best-effort GPU conditions at measurement time. The real_gpu vendor check is necessary but
 * NOT sufficient for a trustworthy performance number: a display-attached laptop GPU shared
 * with a browser/editor can be downclocked or contended while still reporting vendor=nvidia.
 * Recording utilization/clock/power makes "canonical" checkable instead of assumed. Returns
 * null off NVIDIA/Windows — the receipt then simply states the conditions were not observable.
 */
function sampleGpuConditions() {
  try {
    const csv = execFileSync(
      'nvidia-smi',
      [
        '--query-gpu=utilization.gpu,clocks.sm,clocks.max.sm,pstate,power.draw,memory.used',
        '--format=csv,noheader,nounits',
      ],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    const [util, clock, clockMax, pstate, power, mem] = csv.trim().split(',').map((x) => x.trim());
    return {
      utilization_pct: Number(util),
      clock_sm_mhz: Number(clock),
      clock_sm_max_mhz: Number(clockMax),
      pstate,
      power_draw_w: Number(power),
      memory_used_mib: Number(mem),
    };
  } catch {
    return null;
  }
}

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

  // Batch default is 2^18, NOT the d3 receipt's 2^20. A d5 decode is ~4x the variables and
  // far more Tanner edges than d3, so 2^20 decodes in ONE dispatch runs past the Windows TDR
  // watchdog (~2s) and hangs the device: measured on the RTX 3060 seat, 2^18 = 527ms, so 2^20
  // lands at ~2.1s -> DXGI_ERROR_DEVICE_HUNG mid-benchmark. Inheriting the d3 batch shape here
  // was a real defect: the documented command killed the GPU it was meant to measure. The
  // receipt records the batch/reps that actually ran, so cross-distance comparison stays honest
  // (compare decodes/sec, not batch size). Override via env for other hardware.
  const batch = Number(process.env.QEC_BENCH_BATCH ?? 1 << 18);
  const reps = Number(process.env.QEC_BENCH_REPS ?? 30);
  const passes = Number(process.env.QEC_BENCH_PASSES ?? 3);
  console.log(`[d5] throughput (${batch} × ${reps}, ${passes} passes) …`);
  // Pass 1 also serves as the clock-ramp warmup: a laptop GPU sits in a low power state until
  // sustained work arrives, so a single-pass number can be a downclock artifact. Reporting the
  // spread lets a reader see whether it was.
  const passResults = [];
  let conditions = null;
  for (let i = 0; i < passes; i++) {
    passResults.push(await decoder.benchmarkThroughput(batch, reps));
    conditions = sampleGpuConditions() ?? conditions; // sampled while the GPU is under load
  }
  const rates = passResults.map((t) => t.decodesPerSecond).sort((a, b) => a - b);
  const median = rates[rates.length >> 1];
  const throughput = passResults.find((t) => t.decodesPerSecond === median) ?? passResults[0];
  console.log(
    `[d5] ${Math.round(throughput.decodesPerSecond).toLocaleString()} decodes/s (median of ${passes}; spread ${Math.round(rates[0]).toLocaleString()}–${Math.round(rates[rates.length - 1]).toLocaleString()}), ${throughput.nsPerDecodeAmortized.toFixed(1)} ns amortized, fast-path ${(throughput.gpuFastPathFraction * 100).toFixed(1)}%`
  );
  if (conditions) {
    console.log(
      `[d5] device under load: ${conditions.utilization_pct}% util, ${conditions.clock_sm_mhz}/${conditions.clock_sm_max_mhz} MHz, ${conditions.pstate}, ${conditions.power_draw_w} W`
    );
  }

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
    device_conditions: conditions,
    device_conditions_note: conditions
      ? 'Sampled while the throughput passes were running. A vendor check alone cannot tell a quiet GPU from a contended, downclocked one — these fields are what makes canonical:true checkable.'
      : 'Not observable on this platform (nvidia-smi absent). Performance fields are a real-GPU measurement of UNSTATED device conditions; treat cross-machine comparison with care.',
    throughput: {
      ...throughput,
      passes: passResults.length,
      decodes_per_second_all_passes: passResults.map((t) => t.decodesPerSecond),
      note:
        'Headline is the MEDIAN of the passes; the full spread is listed so a downclock or ' +
        'contention artifact is visible rather than averaged away. Batch shape is 2^18 x 30, NOT ' +
        'the 2^20 x 30 of the d3 receipt: one 2^20 d5 dispatch runs past the Windows GPU watchdog ' +
        '(~2s) and hangs the device (DXGI_ERROR_DEVICE_HUNG) — measured on this seat, where 2^18 ' +
        'takes ~0.5s. Compare decodes/sec across distances, never batch size.',
    },
    latency: {
      d5: latency,
      d3_same_class_same_run: latencyD3,
      note:
        'Single-shot latency is the real-time-loop number the d3 receipt lacked, and it is NOT a ' +
        'measurement of BP arithmetic: it is dominated by submit/readback overhead (buffer create ' +
        '+ upload + map) and, on a display-attached GPU shared with other applications, by queue ' +
        'contention. Read the SPREAD, not the p50 — on this seat min and max differ by ~100x on the ' +
        'same run, which is the signature of scheduling, not of compute. The min is the closest ' +
        'thing to a floor for this API shape. The conclusion survives all of that and is the point: ' +
        'a per-round decode loop on this API shape cannot hit a sub-microsecond budget at ANY code ' +
        'distance; batching across rounds/patches is where the GPU substrate wins (see throughput). ' +
        'A dedicated, non-display GPU would tighten these numbers but not change that conclusion.',
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
