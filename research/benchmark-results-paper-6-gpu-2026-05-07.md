---
title: "Paper 6 GPU benchmark results"
date: "2026-05-07"
artifact: ".bench-logs/paper-6-gpu-bench.json"
commit: "bca146a79"
runner: "packages/engine/run-paper6-gpu-capture.mjs"
---

# Paper 6 GPU Benchmark Results

## Machine Summary

- Task: `task_1778176197799_e1p2`.
- Clean worktree: `C:\tmp\HoloScript-paper6-bench-codex` at commit `bca146a79`.
- Runner: `packages/engine/run-paper6-gpu-capture.mjs`.
- Harness: `packages/engine/src/animation/paper/benchmarks/p6-gpu-publication.ts`.
- Artifact: `.bench-logs/paper-6-gpu-bench.json`.
- Artifact sha256: `749c70daeb7bf59b833fa6600f3ce52545419d94acd62262d669d4f005fa9aa5`.
- Artifact bytes: `11906`.
- Run timestamp: `2026-05-07T17:58:51.306Z`.
- GPU: `NVIDIA GeForce RTX 3060 Laptop GPU`, driver `591.74`, memory `6144 MiB`, bus `00000000:01:00.0`.

## Commands

```powershell
pnpm install --frozen-lockfile
pnpm --filter @holoscript/engine exec vitest run src\animation\paper\benchmarks\__tests__\p6-gpu-publication.test.ts
node packages\engine\run-paper6-gpu-capture.mjs --out=.bench-logs\paper-6-gpu-bench.json
```

## Validation

- `pnpm install --frozen-lockfile`: pass.
- `pnpm --filter @holoscript/engine exec vitest run src\animation\paper\benchmarks\__tests__\p6-gpu-publication.test.ts`: pass, 12 tests.
- `node packages\engine\run-paper6-gpu-capture.mjs --out=.bench-logs\paper-6-gpu-bench.json`: pass.

## Results

| Mecanim version | Rigs | Diverged | Divergence rate | Mean max-L1 | p99 max-L1 |
|---|---:|---:|---:|---:|---:|
| Unity 2021.3 LTS | 10 | 0 | 0.0% | 0.000e+0 | 0.000e+0 |
| Unity 2022.3 LTS | 10 | 10 | 100.0% | 7.592e-4 | 7.594e-4 |
| Unity 2023.2 | 10 | 10 | 100.0% | 7.592e-4 | 7.594e-4 |

## Notes

- The board task named `benchmarks/p6-gpu-publication.ts`; current code path is `packages/engine/src/animation/paper/benchmarks/p6-gpu-publication.ts`.
- The artifact `paper_ref` still points to `ai-ecosystem/research/paper-6-animation-sca.tex` by design in `packages/engine/src/animation/paper/benchmarks/p6-gpu-publication.ts`.
- The local Windows wrapper reported `--force_high_performance_gpu` in `BENCH_CHROMIUM_ARGS`.
