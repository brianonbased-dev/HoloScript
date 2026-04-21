# Paper-10 depth-distribution compile matrix — shipped harness

**Paper:** HS Core PLDI 2027 (`paper-10-hs-core-pldi.tex` in research repo). **Purpose:** empirical grid for the Modal Decomposition / scene-graph depth discussion alongside BuildCache provenance (see `paper-10-provenance-cache.test.ts`).

## What runs

Synthetic HoloComposition **forests**: `width` parallel root chains, each chain depth `maxDepth`, traits `glowing` + `collidable`, deterministic stub compiler. `IncrementalCompiler.compile` runs per cell; we assert compiled output non-empty and **depth histogram** sums to total node count.

## Grid (camera-ready)

When `PAPER10_FULL=1` (or `--full` on the runner script):

| Axis | Values |
|------|--------|
| Seeds | 20 |
| Depths | 1, 2, 3, 4, 5, 6, 8 |
| Widths (parallel chains) | 1, 2, 4, 8, 16, 24, 32 |

**Cells:** 20 × 7 × 7 = **980** compile-matrix cells per full run (the board “50×k” wording refers to this **depth × width × seed** sweep; *k* indexes the grid dimensions).

## How to run

From `packages/core`:

```bash
pnpm run benchmark:paper10:compile-matrix
```

Full matrix (slower, for paper tables / local verification):

```bash
pnpm run benchmark:paper10:compile-matrix:full
```

Equivalent: `PAPER10_FULL=1` + vitest on `src/compiler/__tests__/paper-10-compile-matrix-depth.bench.test.ts`.

## CI default

Without `PAPER10_FULL`, the test uses a **reduced** grid (3 seeds; depths 1, 4, 8; widths 1, 8, 32) so `pnpm test` stays fast.

## Source

- Implementation: `packages/core/src/compiler/__tests__/paper-10-compile-matrix-depth.bench.test.ts`
- Runner: `packages/core/scripts/run-paper10-compile-matrix.mjs`
