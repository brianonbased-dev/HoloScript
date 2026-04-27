# Paper-10 §3.3 — Empirical Depth Distribution (50 × k matrix)

- Date: 2026-04-27
- Commit: local-run
- Sources: 50 (deterministic, mulberry32 seeded)
- Targets: WebGPU, VRChat (k = 2 → 50 × k = 100 jobs)
- Wall-clock: 22.6 ms
- Optimizer passes (p): 3 (paper-10 §3.3 line 567)
- Structural bound: 8 + p + 2t = [13, 15]

## Aggregate (over 100 cells)

| Component               | min | median | p95 | max | mean   |
|-------------------------|-----|--------|-----|-----|--------|
| Pipeline pass depth     | 13  | 15     | 15  | 15  | 14.00  |
| Trait-comp chain depth  | 1   | 3      | 3   | 3   | 2.86   |
| **Total chain depth**   | 14  | 16     | 18  | 18  | 16.86  |

## Bound check

- Pipeline depth ∈ [13, 15] for all cells: **PASS**
- WebGPU observed t: 1 (median)
- VRChat observed t: 2 (median)

## Per-target breakdown

### webgpu

- Cells: 50
- Total chain depth — min 14, median 16, p95 16, max 16, mean 15.86

### vrchat

- Cells: 50
- Total chain depth — min 16, median 18, p95 18, max 18, mean 17.86

## Per-cell sample (first 10)

| sourceId | target | objs | maxTraits | t | pipeline | traitChain | total |
|----------|--------|------|-----------|---|----------|------------|-------|
| 0 | webgpu | 2 | 4 | 1 | 13 | 3 | 16 |
| 0 | vrchat | 2 | 4 | 2 | 15 | 3 | 18 |
| 1 | webgpu | 13 | 4 | 1 | 13 | 3 | 16 |
| 1 | vrchat | 13 | 4 | 2 | 15 | 3 | 18 |
| 2 | webgpu | 15 | 4 | 1 | 13 | 3 | 16 |
| 2 | vrchat | 15 | 4 | 2 | 15 | 3 | 18 |
| 3 | webgpu | 15 | 4 | 1 | 13 | 3 | 16 |
| 3 | vrchat | 15 | 4 | 2 | 15 | 3 | 18 |
| 4 | webgpu | 5 | 4 | 1 | 13 | 3 | 16 |
| 4 | vrchat | 5 | 4 | 2 | 15 | 3 | 18 |

## Methodology

Pipeline pass depth = parse(1) + AST(1) + optimize(p=3) + lower(2) + target(t observed) + output(1).
Trait-composition chain depth (per object) = count of ⊗ operators in the ProvenanceSemiring source string when traits are composed under an explicit `tropical-min-plus` rule on the shared `depth` property. Cell value = max across objects in source.
Total chain depth per cell = pipeline + trait-composition.

## Source

- Harness: `packages/core/src/compiler/__tests__/paper-10-depth-distribution-50xk.bench.test.ts`
- Runner:  `packages/core/scripts/run-paper10-depth-distribution.mjs`
