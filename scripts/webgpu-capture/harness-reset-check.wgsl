// harness-reset-check.wgsl
//
// Deterministic single-thread kernel that writes a constant to a single
// u32 storage slot. Used to verify the capture-bench harness's per-trial
// reset path actually works — if every trial produces the same digest,
// the harness is OK and any non-determinism observed in other kernels
// (cael-trace-fold-v1, etc.) is a real GPU finding, not a reset race.
//
// Expected behavior: 100 trials → 1 unique digest (bit-identical = true).
// If we see > 1 unique digest here, the harness has a reset race that
// must be fixed before any determinism claim is trusted.

@group(0) @binding(0) var<storage, read_write> out: array<u32, 4>;

@compute @workgroup_size(1)
fn main() {
  out[0] = 0xdeadbeefu;
  out[1] = 0xcafef00du;
  out[2] = 0x12345678u;
  out[3] = 0x9abcdef0u;
}
