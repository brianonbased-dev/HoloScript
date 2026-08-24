---
'@holoscript/snn-webgpu': minor
---

Distance-parameterized QEC decoding: `buildRotatedSurfaceCode(d)` generates rotated surface codes for any odd d with hard validity gates (CSS commutation, k=1 by GF(2) rank, exact distance by weight-bounded enumeration — the generated d3 reproduces the graduated [[9,1,3]] layout exactly); `buildMinWeightLookup` gives the exact-ML reference by weight-ordered sweep (d5: all 4096 syndromes covered by weight 6, no 2^25 loop); `QECDecoderD` runs generated WGSL for any code and adds the measurement the d3 receipt lacked — `benchmarkLatency` (single-shot submit→readback p50/p95) alongside `benchmarkThroughput`. Honest d5 semantics: BP+OSD-0 is 100% syndrome-valid but NOT exact-ML at d5 (measured 4078/4096 = 99.56% coset agreement, pinned in tests); the GPU port matches the CPU reference syndrome-for-syndrome. New bench script `qec-decode-bench-d5.mjs` with the same anti-theatre gate (software adapters produce explicitly non-canonical receipts).
