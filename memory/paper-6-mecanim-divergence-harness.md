# Paper-6 Mecanim ordering-divergence matrix — shipped harness

**Paper:** Animation SCA (`paper-6-animation-sca.tex` in research repo).

## What runs

Synthetic **6×6** matrix: rows = layer counts `{3,4,5,6,7,8}`, columns = RNG seeds `{11,22,33,44,55,66}` (**36 cells**). Per cell: 48 random evaluation orders (Fisher–Yates), **last-write** blending over four scalar parameters, **max pairwise L1** between outcomes — a stand-in for Mecanim-style ordering sensitivity without a Unity license in CI.

Console lines tagged **`[paper-6][gpu-matrix]`** are meant to be copied into the paper’s evaluation table.

## Commands

From `packages/core`:

```bash
pnpm run benchmark:paper6:mecanim-matrix
```

Runs `paper-6-mecanim-divergence-matrix.bench.test.ts` via Vitest (same pattern as paper-10).

## Source

- `packages/core/src/compiler/__tests__/paper-6-mecanim-divergence-matrix.bench.test.ts`
- Runner: `packages/core/scripts/run-paper6-mecanim-matrix.mjs`
