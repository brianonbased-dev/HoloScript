# Paper-6 — Mecanim-style **synthetic** ordering-divergence matrix (in repo)

**Scope:** The paper’s TeX `\\todo{}` at `paper-6-animation-sca.tex:104` calls for measured
divergence data. This repository ships a **deterministic, synthetic** 6×6 matrix harness
(36 cells) that proxies **Mecanim-style** “evaluation order of layers changes blended pose”
sensitivity: random layer tensors + Fisher–Yates order samples + **max pairwise L1** drift.

It is **not** a Unity Editor cross-version Mecanim re-target of production rigs; that remains
a separate integration effort when assets + CI are available. Use this file for
**[paper-6][gpu-matrix]** table lines until a Unity-backed matrix exists.

## Reproduce (same as CI-friendly script)

```bash
cd packages/core
pnpm run benchmark:paper6:mecanim-matrix
# or: pnpm exec vitest run src/compiler/__tests__/paper-6-mecanim-divergence-matrix.bench.test.ts
```

## Captured run (regenerate for camera-ready)

| Field | Value |
|-------|--------|
| **Host OS** | win32 x64 |
| **Node** | v22.22.0 |
| **Captured** | 2026-04-21 |

### `[paper-6][gpu-matrix]` (max L1 per cell, tab-separated)

Row labels = layer counts `[3,4,5,6,7,8]`; column seeds = `[11,22,33,44,55,66]`.

```
 3.192	5.378	2.401	2.952	2.864	3.317
3.583	3.020	3.062	3.861	4.560	4.329
4.051	2.464	3.660	2.913	3.776	4.766
5.098	3.928	3.614	4.687	3.191	4.077
5.526	4.829	3.676	3.622	3.832	3.702
4.219	4.317	3.399	4.254	5.255	4.833
```

- **cells** = 36  
- **wallMs** (one local run) ≈ 10.8 ms  

Code: `packages/core/src/compiler/__tests__/paper-6-mecanim-divergence-matrix.bench.test.ts`  
Narrative: `memory/paper-6-mecanim-divergence-harness.md` (if present in checkout).
