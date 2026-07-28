#!/usr/bin/env node
/** Build the tracked Paper 4 claim/code/evidence triad from fresh receipts. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const generatorPath = fileURLToPath(import.meta.url);
const evidenceRoot = path.join(repoRoot, '.bench-logs-evidence');
const runRelative = 'paper-4-cpu-reproduction-h1-win-2026-07-18';
const defaults = {
  sandbox: path.join(evidenceRoot, runRelative, 'sandbox-overhead.log'),
  contract: path.join(evidenceRoot, runRelative, 'contract-overhead.log'),
  cael: path.join(evidenceRoot, runRelative, 'cael-replay.log'),
  cpu: path.join(evidenceRoot, 'paper-4-cpu-components-h1-win-2026-07-18.json'),
  webgpu500: path.join(evidenceRoot, 'paper-4-cael-fold-500-h1-win-localchrome-2026-07-18.json'),
  webgpu10k: path.join(evidenceRoot, 'paper-4-cael-fold-10k-h1-win-localchrome-2026-07-18.json'),
};

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outPath = path.resolve(
  repoRoot,
  outIndex >= 0
    ? requiredArg(args[outIndex + 1], '--out requires a path')
    : '.bench-logs-evidence/paper-4-reproduction-manifest-2026-07-18.json'
);

const logs = {
  sandbox: readText(defaults.sandbox),
  contract: readText(defaults.contract),
  cael: readText(defaults.cael),
};
const receipts = {
  cpu: readJson(defaults.cpu),
  webgpu500: readJson(defaults.webgpu500),
  webgpu10k: readJson(defaults.webgpu10k),
};

for (const [name, log] of Object.entries(logs)) {
  assert(log.includes('# relevant_paths_clean: true'), `${name} log is not source-clean`);
  assert(/Test Files\s+1 passed \(1\)/u.test(log), `${name} log did not isolate one test file`);
}
for (const [name, receipt] of Object.entries(receipts)) {
  assert(receipt.code_provenance?.relevant_paths_clean === true, `${name} receipt is not clean`);
  assert(/^[0-9a-f]{40}$/u.test(receipt.protocol_commit ?? ''), `${name} commit is missing`);
}
assert(receipts.cpu.path === 'cpu-component', 'CPU evidence must not claim substitute equivalence');
for (const name of ['webgpu500', 'webgpu10k']) {
  const digest = receipts[name].results?.[0]?.digest_summary;
  assert(digest?.digest_bit_identical === true, `${name} is not bit-identical`);
  assert(digest?.unique_digest_count === 1, `${name} has multiple digests`);
  assert(digest?.digest_count === receipts[name].results?.[0]?.trials, `${name} omitted digests`);
}

const manifest = {
  schema_version: 'paper-reproduction-triad-v1',
  generated_at: new Date().toISOString(),
  paper: 'paper-4-sandbox-usenix',
  task: 'task_1784368626374_pu11',
  status: 'current-code-reproduced_historical-values-not-reproduced',
  generator: {
    path: relative(generatorPath),
    sha256: createHash('sha256').update(readFileSync(generatorPath)).digest('hex'),
  },
  integration_model: {
    triad: ['paper_claim', 'implementation_path', 'executable_evidence'],
    code_as_variable:
      'Every admitted measurement carries a source SHA-256 and a path-scoped cleanliness result.',
    paradox:
      'A historical number can be authentic to its old harness while remaining invalid evidence for the subsystem named by the paper.',
    admission_rule:
      'Admit a current claim only when implementation semantics, measurement label, and tracked receipt agree.',
  },
  claim_units: [
    {
      id: 'plugin-runner-categories',
      historical_source: '.bench-logs/2026-04-18T07-20-56-134Z/sandbox-overhead.log',
      historical_verdict: 'not reproduced; old labels did not match measured execution boundaries',
      implementation: 'packages/core/src/plugins/__tests__/paper-4-sandbox-bench.test.ts',
      evidence: relative(defaults.sandbox),
      current_scope: 'same-process PluginSandboxRunner only',
      current_measurements: parseSandbox(logs.sandbox),
    },
    {
      id: 'standalone-contract-wrapper',
      historical_source: '.bench-logs/2026-04-18T07-20-56-134Z/contract-overhead.log',
      historical_verdict: 'not reproduced; old harness did not await contracted solve',
      implementation: 'packages/engine/src/simulation/__tests__/paper-benchmarks.test.ts',
      evidence: relative(defaults.contract),
      current_scope: 'awaited standalone TET4 wrapper with post-solve digest',
      current_measurements: parseContract(logs.contract),
    },
    {
      id: 'geometry-hash-component',
      historical_source: '.bench-logs/2026-04-18T07-20-56-134Z/contract-overhead.log',
      historical_verdict: 'not reproduced exactly; no 100K-node extrapolation admitted',
      implementation: 'packages/engine/src/simulation/__tests__/paper-benchmarks.test.ts',
      evidence: relative(defaults.contract),
      current_scope: 'raw hashGeometry timing for four fixture sizes',
      current_measurements: parseGeometry(logs.contract),
    },
    {
      id: 'cael-verify-and-mock-replay',
      historical_source: '.bench-logs/2026-04-18T07-20-56-134Z/cael-replay.log',
      historical_verdict:
        'not reproduced; old path double-counted verify and skipped digest comparison',
      implementation:
        'packages/engine/src/simulation/__tests__/paper-cael-replay-benchmark.test.ts',
      evidence: relative(defaults.cael),
      current_scope: 'verifier-only throughput plus one same-adapter mock replay',
      current_measurements: parseCael(logs.cael),
    },
    {
      id: 'cpu-component-hardware-rows',
      historical_source: '.bench-logs/2026-05-29T*/paper-4-rtx-bench.json',
      historical_verdict: 'H1/H3 pairing not reproduced; CPU components are not WGSL substitutes',
      implementation: 'scripts/paper4-rtx-bench-standalone.mjs',
      evidence: relative(defaults.cpu),
      current_scope: 'H1 CPU component baselines only',
      current_measurements: receipts.cpu.results,
    },
    {
      id: 'webgpu-same-machine-replay',
      historical_source: '.bench-logs/2026-05-29T*/paper-4-sandbox-usenix-main.json',
      historical_verdict:
        'old overlapping-atomic kernel was nondeterministic and omitted digest readback',
      implementation: 'scripts/webgpu-capture/cael-trace-fold-v1.wgsl',
      evidence: [relative(defaults.webgpu500), relative(defaults.webgpu10k)],
      current_scope: 'same machine, same redacted adapter, Chrome 150, bit-identical readback',
      current_measurements: [webgpuSummary(receipts.webgpu500), webgpuSummary(receipts.webgpu10k)],
    },
  ],
  nonclaims: [
    'Historical numeric equality was not reproduced.',
    'The CPU component rows do not substitute for or bound the WGSL kernel.',
    'Browser adapter identity was redacted, so cross-adapter and cross-vendor identity remain unproven.',
    'No current H3 receipt was captured.',
    'No integrated production sandbox latency was measured.',
  ],
};

mkdirSync(path.dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(`[paper4-reproduction] manifest -> ${outPath}`);

function requiredArg(value, message) {
  if (!value) throw new Error(message);
  return value;
}

function readText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function relative(filePath) {
  return path.relative(repoRoot, filePath).replaceAll('\\', '/');
}

function parseSandbox(log) {
  return [
    ...log.matchAll(
      /\[sandbox-bench\] (Cold Runner|Cached Expression|Unique Compile\+Run)\s*\| Median: ([\d.]+) ms \| p99: ([\d.]+) ms/gu
    ),
  ].map(([, operation, median, p99]) => ({
    operation,
    median_ms: Number(median),
    p99_ms: Number(p99),
  }));
}

function parseContract(log) {
  return [
    ...log.matchAll(
      /^\| (Small|Medium|Large)\s+\|\s+(\d+)\s+\|\s+(\d+)\s+\|\s+([\d.]+) \(p99: ([\d.]+)\) \|\s+([\d.]+) \(p99: ([\d.]+)\) \|\s+([-\d.]+)% \|$/gmu
    ),
  ].map(([, mesh, nodes, dof, bare, bareP99, contracted, contractedP99, overhead]) => ({
    mesh,
    nodes: Number(nodes),
    dof: Number(dof),
    bare_median_ms: Number(bare),
    bare_p99_ms: Number(bareP99),
    contracted_median_ms: Number(contracted),
    contracted_p99_ms: Number(contractedP99),
    overhead_percent: Number(overhead),
  }));
}

function parseGeometry(log) {
  return [...log.matchAll(/^\|\s+(\d+)\s+\|\s+(\d+)\s+\|\s+(\d+)\s+\|\s+([\d.]+)\s+\|$/gmu)].map(
    ([, nodes, vertices, elements, median]) => ({
      nodes: Number(nodes),
      coordinate_values: Number(vertices),
      elements: Number(elements),
      median_ms: Number(median),
    })
  );
}

function parseCael(log) {
  const verify = log.match(/verify: ([\d.]+) us\/entry median \(p99: ([\d.]+) us\/entry\)/u);
  const replay = log.match(/single mock replay wall .* ([\d.]+)ms \((\d+) entries\)/u);
  assert(verify && replay, 'CAEL metrics were not found');
  return {
    entries: Number(replay[2]),
    verify_median_us_per_entry: Number(verify[1]),
    verify_p99_us_per_entry: Number(verify[2]),
    mock_replay_wall_ms: Number(replay[1]),
  };
}

function webgpuSummary(receipt) {
  const result = receipt.results[0];
  return {
    scale: result.scale,
    trials: result.trials,
    wall_median_us: result.median_us,
    gpu_median_us: result.gpu_median_us,
    digest_count: result.digest_summary.digest_count,
    unique_digest_count: result.digest_summary.unique_digest_count,
    digest_bit_identical: result.digest_summary.digest_bit_identical,
    adapter_identity_disclosed: Object.values(receipt.adapter_info ?? {}).some(Boolean),
    protocol_commit: receipt.protocol_commit,
    code_provenance: receipt.code_provenance,
  };
}
