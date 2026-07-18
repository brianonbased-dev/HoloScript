// cael-trace-fold-v1 — WebGPU determinism-replay fold kernel.
//
// Source of truth: packages/engine/src/testing/WebGPUDeterminismHarness.ts
//                  (HARNESS_WGSL constant, HARNESS_KERNEL_NAME = 'cael-trace-fold-v1').
//
// This standalone .wgsl mirror exists so the capture-bench driver can point a
// `\measuredFrom{}` cite at a stable on-disk file with a stable SHA-256, rather
// than at a string literal inside a TypeScript module. The two MUST stay in
// lockstep — if WebGPUDeterminismHarness.ts changes the kernel, this file
// MUST be updated to match, and the determinism-protocol commit-hash field
// in receipts pins both via `protocol_commit`.
//
// Bind groups:
//   group(0):
//     binding(0) — traceRows : array<TraceRow>      (read)
//     binding(1) — finalState: array<atomic<u32>,8> (read_write)
//     binding(2) — params    : Params               (uniform)
//
// Workgroup size: 64.
// Entry point: main.
//
// Historical determinism finding (superseded 2026-07-18):
//   This kernel mixes atomicXor and atomicAdd on overlapping finalState
//   slots. XOR and ADD do not commute with each other on u32, so the
//   final state varies across replays even on the same adapter (52/100
//   distinct digests on local Chrome/Intel UHD; 100/100 on Tesla V100
//   NVIDIA Vulkan). Paper 3 §replay-determinism Property[same-adapter
//   scope] did not hold for the historical overlapping-slot kernel.
//
//   The finding is documented at
//   ai-ecosystem:research/2026-05-29_paper-3-determinism-finding.md
//   with two paths to closure (kernel redesign vs. paper edit to Route 2b
//   semantic ε-tolerance). Both paths are upstream of this mirror — the
//   repaired kernel here remains in lockstep with packages/engine/src/testing/
//   WebGPUDeterminismHarness.ts. Capture receipts now require digest readback
//   before they can be admitted as Paper 4 evidence.
//
// Current scope:
//   XOR reductions occupy slots 0..7 and ADD reductions occupy slots 8..15.
//   Same-adapter bit identity still requires measured receipt readback.
//   Cross-adapter bit identity remains unproven.

struct TraceRow {
  a: u32,
  b: u32,
  c: u32,
  d: u32,
};

struct Params {
  traceLength: u32,
  scenarioSalt: u32,
  replication: u32,
  _pad: u32,
};

@group(0) @binding(0) var<storage, read> traceRows: array<TraceRow>;
@group(0) @binding(1) var<storage, read_write> finalState: array<atomic<u32>, 16>;
@group(0) @binding(2) var<uniform> params: Params;

fn mix32(input: u32) -> u32 {
  var x = input;
  x = x ^ (x >> 16u);
  x = x * 0x7feb352du;
  x = x ^ (x >> 15u);
  x = x * 0x846ca68bu;
  x = x ^ (x >> 16u);
  return x;
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let i = gid.x;
  if (i >= params.traceLength) {
    return;
  }

  let row = traceRows[i];
  var v = mix32(row.a ^ params.scenarioSalt);
  v = mix32(v + row.b + (i * 0x85ebca6bu));
  v = mix32(v ^ row.c);
  v = mix32(v + row.d);

  // Keep operation domains disjoint. XOR reductions use slots 0..7 and
  // additive counters use slots 8..15, so every contended slot is updated
  // by one associative/commutative u32 operation only.
  atomicXor(&finalState[i % 8u], v);
  atomicAdd(&finalState[8u + (i % 8u)], mix32(v ^ 0xc2b2ae35u));
}
