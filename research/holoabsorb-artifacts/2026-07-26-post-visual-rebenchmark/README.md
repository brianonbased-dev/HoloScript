# HoloAbsorb post-visual rebenchmark

This directory is the tracked rebenchmark receipt set produced after the
four-arm visual graph context safety evaluation. The final unified run used the
fresh live-board snapshot in this directory and passed all seven benchmark and
audit stages. Its orchestration receipt uses `skipBuild: true` because the
Absorb package had already passed its build and full test suite in the same
implementation cycle; no stale build log is retained in this receipt set.

## Current results

- HoloAbsorb umbrella audit: pass.
  - 10 capabilities with unique owners.
  - 28 declared tools with one capability owner each.
  - 10 explicit compatibility or substrate aliases.
  - 6 workstreams represented in the live-board snapshot.
  - 32 declared evidence paths present.
- Bounded delta refresh: pass.
  - 120-file deterministic fixture; 15 changed files.
  - 2,880 of 2,895 refreshed symbols reused (`0.994819`).
  - 5,865-byte compact refresh response versus a 1,097,399-byte graph cache.
  - Fresh-process authority and query checks both passed.
- Paper 5 retrieval bootstrap (`N=10`, 154 files, 7,458 symbols):
  - Keyword-only P@5/MRR: `0.180/0.761`.
  - Sovereign HoloEmbed semantic-only: `0.140/0.484`.
  - Sovereign HoloEmbed hybrid: `0.180/0.867`.
  - Sovereign HoloEmbed hybrid plus Graph RAG: `0.180/0.867`.
  - Structural-only hybrid plus Graph RAG floor: `0.160/0.750`.
- Paper 5 timing sanity check:
  - Capture class: `ci-reference`; 100 trials and 30 synthetic queries.
  - End-to-end median/p95: `0.388/0.884 ms`.
  - The artifact records the RTX 3060 Laptop GPU in host inventory, but the
    runner does not verify CUDA execution and makes no GPU speedup claim.
- Paper 26:
  - EventEdge benchmark passed.
  - HoloEmbed natural-language recall benchmark passed.
  - These are synthetic regression checks, not production throughput claims.

## Claim boundary

The Paper 5 values are deterministic regression evidence on one small,
single-gold-file query set. They show that the current sovereign HoloEmbed
hybrid path exceeds the structural-only floor on this fixture. They do not
establish publication-scale retrieval superiority, developer-trust outcomes,
GPU acceleration, or production-monorepo throughput.

The matching canonical paper source is
`ai-ecosystem/research/paper-5-graphrag-icse.tex`. In-progress paper sources are
canonical in the sibling `ai-ecosystem` repository; the HoloScript copy is an
ignored local mirror.

## Reproduce

From the HoloScript repository:

```powershell
node packages/absorb-service/scripts/bench-holoabsorb.mjs `
  --skip-build `
  --out-dir=research/holoabsorb-artifacts/2026-07-26-post-visual-rebenchmark `
  --board=research/holoabsorb-artifacts/2026-07-26-post-visual-rebenchmark/live-board-snapshot.json `
  --paper5-max-files=500 `
  --paper5-trials=100
```
