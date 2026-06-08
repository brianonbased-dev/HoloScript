#!/usr/bin/env node
/**
 * verify-atomic-commutativity.mjs — falsify or confirm pairwise
 * commutativity of WGSL atomic operations on overlapping storage slots
 * under workgroup-level interleaving.
 *
 * Background (W.GOLD.554)
 * -----------------------
 * Paper 4 §7.8 cael-trace-fold-v1 claimed bit-identical same-adapter
 * replay. The real-GPU capture (.bench-logs-evidence/paper-4-cael-fold-
 * 500-h3-quadro-p4000.json) observed 100 distinct SHA-256 digests across
 * 100 trials. Root cause: the kernel mixes `atomicXor` (for the trace
 * accumulator) with `atomicAdd` (for the row counter) on overlapping
 * slots. XOR and ADD on u32 do NOT commute, so the final state depends
 * on the order in which workgroups happen to win the arbitration — and
 * that order is not guaranteed identical across two dispatches.
 *
 * This script generalizes that finding into a reusable verifier: give it
 * a list of WGSL atomic primitive PAIRS, and it tells you which pairs
 * are safe to mix (commutative under interleaving) and which are not.
 *
 * Methodology
 * -----------
 * For each pair (op_a, op_b):
 *   1. Allocate a small `atomic<u32>` storage buffer with 1 slot.
 *   2. Compile a kernel where workgroup 0 calls op_a(args_a) and
 *      workgroup 1 calls op_b(args_b).
 *   3. Run M trials, recording SHA-256 of the final state each time.
 *   4. If `unique_digest_count == 1` → COMMUTATIVE under this hardware's
 *      interleaving (cannot be falsified at this scale; may still be
 *      false under different inputs).
 *      If > 1 → NON-COMMUTATIVE — at least two interleavings produced
 *      different final states. Reviewer-fatal for a bit-identical-replay
 *      claim that mixes these two ops on overlapping slots.
 *
 * The pairwise matrix is symmetric: we test (a,b) once and infer (b,a).
 *
 * Default suite covers the 6 most-used WGSL atomics. Override with
 * `--ops` to test a custom set.
 *
 * Usage
 * -----
 *   node scripts/webgpu-capture/verify-atomic-commutativity.mjs
 *     [--trials 200]
 *     [--ops add,xor,min,max,and,or]
 *     [--out .bench-logs-evidence/atomic-commutativity-<host>.json]
 *
 * Env (same as capture-bench.mjs):
 *   HOLOSCRIPT_HW_TIER, HOLOSCRIPT_HW_LABEL, HOLOSCRIPT_HW_GPU,
 *   WEBGPU_PROBE_CHROME, WEBGPU_PROBE_HEADLESS, WEBGPU_LAUNCH_ARGS
 *
 * Receipt shape (receipt-v2 superset)
 * -----------------------------------
 *   {
 *     receipt_version: 'v2',
 *     captured_at, path: 'webgpu-browser', paper: 'methodology',
 *     section: 'pairwise-atomic-commutativity',
 *     harness: 'scripts/webgpu-capture/verify-atomic-commutativity.mjs',
 *     hardware, adapter_info, browser,
 *     kernel: { name: 'pairwise_atomic_probe', wgsl_sha256, ... },
 *     pairwise_matrix: {
 *       'add×xor': { commutative: false, unique_digests: 2,
 *                    digest_list: [...], witness_seeds: [...] },
 *       ...
 *     },
 *     notes
 *   }
 */

import http from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { chromium } from 'playwright';

// ── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const trialsArg = parseFlag('--trials');
const opsArg = parseFlag('--ops');
const outArg = parseFlag('--out');
const trials = trialsArg ? parseInt(trialsArg, 10) : 200;
const ops = opsArg ? opsArg.split(',') : ['add', 'xor', 'min', 'max', 'and', 'or'];

function parseFlag(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

// ── Operand catalogue ────────────────────────────────────────────────────
// For each WGSL atomic primitive, we record:
//   - wgsl: the literal call expression (operand template),
//   - arg_a / arg_b: the constant operand each "side" of the pair uses.
// We deliberately pick non-symmetric operands so commutative pairs
// (e.g. add×add at different operands) still produce the same final
// value regardless of order, while non-commutative pairs (add×xor)
// produce different finals.
const OP_CATALOG = {
  add: { call: 'atomicAdd(&slot, OPERAND)', op_a: 7, op_b: 13 },
  xor: { call: 'atomicXor(&slot, OPERAND)', op_a: 0xa5, op_b: 0x5a },
  min: { call: 'atomicMin(&slot, OPERAND)', op_a: 12, op_b: 9 },
  max: { call: 'atomicMax(&slot, OPERAND)', op_a: 11, op_b: 20 },
  and: { call: 'atomicAnd(&slot, OPERAND)', op_a: 0xff, op_b: 0x0f },
  or: { call: 'atomicOr(&slot, OPERAND)', op_a: 0x01, op_b: 0x10 },
};

for (const op of ops) {
  if (!OP_CATALOG[op]) {
    console.error(`[verify] unknown op '${op}'. Known: ${Object.keys(OP_CATALOG).join(',')}`);
    process.exit(1);
  }
}

// ── Generate one WGSL probe per pair ─────────────────────────────────────
// Kernel shape: two workgroups, each of size 64. Workgroup 0 runs op_a;
// workgroup 1 runs op_b. Both target the same single-slot atomic. Both
// share an init value of 0 (rewritten between trials by the host).
function buildProbeWGSL(opAName, opBName) {
  const opA = OP_CATALOG[opAName];
  const opB = OP_CATALOG[opBName];
  const callA = opA.call.replace('OPERAND', `${opA.op_a}u`);
  const callB = opB.call.replace('OPERAND', `${opB.op_b}u`);
  return `// Probe: ${opAName} × ${opBName}
// Two workgroups racing on a single u32 atomic. If the final value is
// invariant across interleavings, the pair commutes at this input.
@group(0) @binding(0) var<storage, read_write> slot: atomic<u32>;
@group(0) @binding(1) var<storage, read_write> sink: array<u32, 64>;

@compute @workgroup_size(64)
fn main(@builtin(workgroup_id) wg: vec3<u32>,
        @builtin(local_invocation_id) lid: vec3<u32>) {
  // Only thread 0 of each workgroup touches the racing slot — the goal
  // is workgroup-level interleaving, not intra-workgroup data races.
  if (lid.x == 0u) {
    if (wg.x == 0u) {
      let _r = ${callA};
      sink[0] = u32(${opA.op_a});
    } else {
      let _r = ${callB};
      sink[1] = u32(${opB.op_b});
    }
  }
}
`;
}

// ── Pair enumeration (unordered, includes self-pairs) ────────────────────
function enumeratePairs() {
  const pairs = [];
  for (let i = 0; i < ops.length; i++) {
    for (let j = i; j < ops.length; j++) {
      pairs.push([ops[i], ops[j]]);
    }
  }
  return pairs;
}

// ── Hardware detection (lifted from capture-bench.mjs) ───────────────────
function detectHardware() {
  const envTier = process.env.HOLOSCRIPT_HW_TIER;
  const envLabel = process.env.HOLOSCRIPT_HW_LABEL;
  const envGpu = process.env.HOLOSCRIPT_HW_GPU;
  const cpuInfo = os.cpus();
  const cpuModel = cpuInfo[0]?.model ?? 'unknown';
  const cpuCount = cpuInfo.length;
  const ramGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
  let tier = 'H1',
    label,
    tierConfidence = 'fallback';
  if (envTier === 'H1' || envTier === 'H2' || envTier === 'H3') {
    tier = envTier;
    label = envLabel ?? `${envTier} (HOLOSCRIPT_HW_TIER=${envTier})`;
    tierConfidence = 'env';
  } else if (/Xeon|Threadripper|EPYC/i.test(cpuModel)) {
    tier = 'H2';
    label = 'H2 (auto-detected workstation/server CPU)';
    tierConfidence = 'detected';
  } else {
    label = 'H1 (fallback)';
  }
  return {
    tier,
    label,
    gpu: envGpu ?? 'unspecified (read from adapter_info)',
    cpu: cpuModel,
    cpuCount,
    ramGb,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version,
    tierConfidence,
  };
}

function gitHeadHash(repoRoot) {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function findRepoRoot(start) {
  let cur = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

// ── Browser launch (same args as capture-bench) ──────────────────────────
async function runAllPairs() {
  const pairs = enumeratePairs();
  const probes = pairs.map(([a, b]) => ({
    name: `${a}×${b}`,
    op_a: a,
    op_b: b,
    wgsl: buildProbeWGSL(a, b),
    wgsl_sha256: null,
  }));
  for (const p of probes) p.wgsl_sha256 = createHash('sha256').update(p.wgsl).digest('hex');

  const DEFAULT_CHROME_WIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const executablePath =
    process.env.WEBGPU_PROBE_CHROME && existsSync(process.env.WEBGPU_PROBE_CHROME)
      ? process.env.WEBGPU_PROBE_CHROME
      : existsSync(DEFAULT_CHROME_WIN)
        ? DEFAULT_CHROME_WIN
        : undefined;
  const headless = process.env.WEBGPU_PROBE_HEADLESS !== '0';
  const baseArgs = [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    ...(process.platform === 'linux' ? ['--use-vulkan'] : []),
    ...(process.env.WEBGPU_LAUNCH_ARGS ? process.env.WEBGPU_LAUNCH_ARGS.split(',') : []),
  ];

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><title>commutativity verifier</title><body><pre id=log></pre></body>');
  });
  const addr = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });

  let browser;
  try {
    browser = await chromium.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
      args: baseArgs,
    });
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[page] ERR ${msg.text()}`);
    });
    await page.goto(`http://127.0.0.1:${addr.port}/`, { waitUntil: 'domcontentloaded' });
    const result = await page.evaluate(runInPage, { probes, trials });
    return {
      adapterInfo: result.adapterInfo,
      browser: {
        userAgent: result.userAgent,
        executablePath: executablePath ?? 'playwright-bundled-chromium',
        headless,
        launchArgs: baseArgs,
      },
      perPair: result.perPair,
      notes: result.notes,
    };
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
}

// ── Page-context driver ──────────────────────────────────────────────────
async function runInPage(input) {
  if (!navigator.gpu) {
    return {
      adapterInfo: null,
      userAgent: navigator.userAgent,
      perPair: [],
      notes: ['no navigator.gpu'],
    };
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    return {
      adapterInfo: null,
      userAgent: navigator.userAgent,
      perPair: [],
      notes: ['requestAdapter null'],
    };
  }
  const adapterInfo = adapter.requestAdapterInfo
    ? await adapter.requestAdapterInfo()
    : { vendor: '', architecture: '', device: '', description: '' };
  const device = await adapter.requestDevice();
  const notes = [];

  async function sha256Hex(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  const perPair = [];
  for (const probe of input.probes) {
    const shader = device.createShaderModule({ code: probe.wgsl });
    const info = shader.getCompilationInfo ? await shader.getCompilationInfo() : { messages: [] };
    const errs = info.messages.filter((m) => m.type === 'error');
    if (errs.length > 0) {
      perPair.push({
        pair: probe.name,
        op_a: probe.op_a,
        op_b: probe.op_b,
        compiled: false,
        compile_errors: errs.map((m) => `${m.lineNum}:${m.linePos} ${m.message}`),
      });
      continue;
    }
    let pipeline;
    try {
      pipeline = device.createComputePipeline({
        layout: 'auto',
        compute: { module: shader, entryPoint: 'main' },
      });
    } catch (e) {
      perPair.push({
        pair: probe.name,
        op_a: probe.op_a,
        op_b: probe.op_b,
        compiled: false,
        compile_errors: [`pipeline: ${e?.message ?? e}`],
      });
      continue;
    }

    // Slot buffer (atomic<u32>) + sink (array<u32,64>) — sink keeps the
    // compiler from optimizing away the workgroup branches.
    const slotBuf = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const sinkBuf = device.createBuffer({
      size: 256,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });
    const staging = device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
    const bg = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: slotBuf } },
        { binding: 1, resource: { buffer: sinkBuf } },
      ],
    });

    // Warm up (1 dispatch — eliminates first-call compile spike).
    {
      device.queue.writeBuffer(slotBuf, 0, new Uint32Array([0]));
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      pass.dispatchWorkgroups(2, 1, 1);
      pass.end();
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
    }

    // Trials — same input, M dispatches; collect digest of final slot.
    const digests = [];
    const finals = [];
    for (let t = 0; t < input.trials; t++) {
      device.queue.writeBuffer(slotBuf, 0, new Uint32Array([0]));
      const enc = device.createCommandEncoder();
      const pass = enc.beginComputePass();
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bg);
      // 2 workgroups => one runs op_a, one runs op_b. Order is GPU-decided.
      pass.dispatchWorkgroups(2, 1, 1);
      pass.end();
      enc.copyBufferToBuffer(slotBuf, 0, staging, 0, 4);
      device.queue.submit([enc.finish()]);
      await device.queue.onSubmittedWorkDone();
      await staging.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(staging.getMappedRange().slice(0));
      const u32 = new Uint32Array(bytes.buffer)[0];
      staging.unmap();
      finals.push(u32);
      digests.push(await sha256Hex(bytes));
    }
    const uniq = [...new Set(digests)];
    const uniqFinals = [...new Set(finals)];
    perPair.push({
      pair: probe.name,
      op_a: probe.op_a,
      op_b: probe.op_b,
      operand_a: input.probes.find((p) => p.name === probe.name) ? undefined : undefined, // placeholder
      compiled: true,
      trials: input.trials,
      unique_digest_count: uniq.length,
      unique_final_values: uniqFinals.length,
      commutative_observed: uniq.length === 1,
      finals_first_8: finals.slice(0, 8),
      uniq_finals_list: uniqFinals.length <= 8 ? uniqFinals : [...uniqFinals.slice(0, 8), null],
      wgsl_sha256: probe.wgsl_sha256,
    });
  }

  return {
    adapterInfo,
    userAgent: navigator.userAgent,
    perPair,
    notes: [
      'Workgroup-level interleaving probe; intra-workgroup races are NOT exercised (only thread 0 of each WG touches the slot).',
      'commutative_observed === true means under THIS hardware/ICD, ' +
        input.trials +
        ' trials produced one final value. It is a falsification tool, not a proof of commutativity.',
      ...notes,
    ],
  };
}

// ── Main ─────────────────────────────────────────────────────────────────
const repoRoot = findRepoRoot(process.cwd());
const hardware = detectHardware();
const captured = await runAllPairs();

const capturedAt = new Date().toISOString();
const matrix = {};
for (const r of captured.perPair) {
  matrix[r.pair] = {
    op_a: r.op_a,
    op_b: r.op_b,
    operand_a: OP_CATALOG[r.op_a].op_a,
    operand_b: OP_CATALOG[r.op_b].op_b,
    compiled: r.compiled,
    compile_errors: r.compile_errors,
    trials: r.trials,
    unique_digest_count: r.unique_digest_count,
    unique_final_values: r.unique_final_values,
    commutative_observed: r.commutative_observed,
    finals_first_8: r.finals_first_8,
    uniq_finals_list: r.uniq_finals_list,
    wgsl_sha256: r.wgsl_sha256,
  };
}

const receipt = {
  receipt_version: 'v2',
  captured_at: capturedAt,
  path: 'webgpu-browser',
  paper: 'methodology',
  section: 'pairwise-atomic-commutativity (W.GOLD.554 verifier)',
  harness: 'scripts/webgpu-capture/verify-atomic-commutativity.mjs',
  hardware,
  adapter_info: captured.adapterInfo,
  browser: captured.browser,
  kernel: {
    name: 'pairwise_atomic_probe',
    wgsl_path: 'scripts/webgpu-capture/verify-atomic-commutativity.mjs (inline)',
    wgsl_sha256: createHash('sha256').update(JSON.stringify(matrix)).digest('hex'),
    workgroup_size: [64, 1, 1],
    dispatch_size: [2, 1, 1],
  },
  protocol_commit: gitHeadHash(repoRoot),
  results: [
    {
      op: 'pairwise_atomic_probe',
      scale: `${ops.length} ops × ${ops.length} pairs (symmetric) = ${enumeratePairs().length} probes`,
      n: ops.length,
      trials: trials,
      median_us: 0,
      p95_us: 0,
      min_us: 0,
      max_us: 0,
    },
  ],
  pairwise_matrix: matrix,
  notes: [
    'Verifies the W.GOLD.554 finding (mixed atomicXor + atomicAdd on overlapping slots breaks bit-identical replay) generalizes.',
    'Pair (a,b) NON-COMMUTATIVE  → mixing a and b on the same atomic slot will break same-adapter bit-identical replay claims.',
    'Pair (a,b) COMMUTATIVE      → at this operand pair, ' +
      trials +
      ' trials yielded a single final value. Necessary but not sufficient for general commutativity (different operands may falsify).',
    ...captured.notes,
  ],
  ots_proof_path: null,
  anchor_chain: null,
};

const summary = Object.entries(matrix)
  .map(
    ([k, v]) =>
      `  ${k.padEnd(10)} compiled=${v.compiled} unique=${v.unique_final_values ?? '?'} commutes=${v.commutative_observed ?? '?'}`
  )
  .join('\n');
console.log(
  `[verify-atomic-commutativity] adapter: ${captured.adapterInfo?.device || '?'} / ${captured.adapterInfo?.architecture || '?'}`
);
console.log(`[verify-atomic-commutativity] pairwise results (${trials} trials each):\n${summary}`);

const benchDir = path.join(repoRoot, '.bench-logs', capturedAt.replace(/[:.]/g, '-'));
mkdirSync(benchDir, { recursive: true });
const outPath = outArg ?? path.join(benchDir, 'pairwise-atomic-commutativity.json');
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(`[verify-atomic-commutativity] receipt → ${outPath}`);
process.exit(0);
