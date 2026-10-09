# @holoscript/snn-webgpu

## 8.9.0

### Minor Changes

- 30f5639: Distance-parameterized QEC decoding: `buildRotatedSurfaceCode(d)` generates rotated surface codes for any odd d with hard validity gates (CSS commutation, k=1 by GF(2) rank, exact distance by weight-bounded enumeration — the generated d3 reproduces the graduated [[9,1,3]] layout exactly); `buildMinWeightLookup` gives the exact-ML reference by weight-ordered sweep (d5: all 4096 syndromes covered by weight 6, no 2^25 loop); `QECDecoderD` runs generated WGSL for any code and adds the measurement the d3 receipt lacked — `benchmarkLatency` (single-shot submit→readback p50/p95) alongside `benchmarkThroughput`. Honest d5 semantics: BP+OSD-0 is 100% syndrome-valid but NOT exact-ML at d5 (measured 4078/4096 = 99.56% coset agreement, pinned in tests); the GPU port matches the CPU reference syndrome-for-syndrome. New bench script `qec-decode-bench-d5.mjs` with the same anti-theatre gate (software adapters produce explicitly non-canonical receipts).

## 8.7.0

## 8.0.6

### Patch Changes

- c64fc1a: Re-lockstep the changesets `fixed` group after W.669's emergency out-of-band publish-fix republishes desynced its members (core 6.1.3, cli 6.1.1, agent-protocol/snn-webgpu/uaal 6.1.0, holo-vm 6.1.1). On the next `changeset version` this realigns all six fixed-group packages to a single coordinated version (6.1.4), restoring the invariant the `fixed` config requires. No functional code change — version-hygiene reconciliation only.

  NOTE: holo-vm's npm `latest` is stranded on the abandoned 7.0.0 platform line (6.1.x was never published for it); a coordinated 6.1.4 publish does NOT reclaim its `latest` tag. That, plus the broader Class-B stranded-7.0.0 set (benchmark, formatter, linter, lsp, mcp-server, partner-sdk, r3f-renderer, std, visual, wasm), is tracked separately as a deliberate release/dist-tag operation — see the board task on npm publish drift reconciliation.

- Updated dependencies [c64fc1a]
  - @holoscript/core@8.0.6

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3
