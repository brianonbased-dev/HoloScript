# HoloAbsorb post-refresh-resilience rebenchmark

Status: **PASS** across all ten unified stages.

This run evaluates the upgraded HoloAbsorb refresh lane together with scan
determinism, the frozen Paper 5 retrieval corpus, Paper 5 timing, Paper 26
HoloGraph/HoloEmbed tests, the umbrella audit, and transport resilience.

Machine-readable receipts:

- [`holoabsorb-rebenchmark.json`](./holoabsorb-rebenchmark.json)
- [`holoabsorb-refresh-benchmark.json`](./holoabsorb-refresh-benchmark.json)
- [`holoabsorb-transport-resilience.json`](./holoabsorb-transport-resilience.json)
- [`paper-5-accuracy-holoembed.json`](./paper-5-accuracy-holoembed.json)
- [`paper-5-accuracy-structural.json`](./paper-5-accuracy-structural.json)
- [`paper-5-timing.json`](./paper-5-timing.json)

## Refresh resilience

The synthetic isolated Git soak advanced HEAD three separate times during one
forced refresh. HoloAbsorb detected all three changes, replanned three times,
reused three content-addressed checkpoint batches, and published only the final
HEAD. The workload completed in 9,445.630 ms.

The preflight host-memory guard refused an impossible reserve request in 11.738
ms and preserved the byte-identical prior cache.

The first unified run exposed a fixed-cadence bottleneck: under suite load, six
HEAD probes consumed 7.8504% of refresh wall time. The adaptive policy now uses
the configured interval as a floor and widens it from measured probe cost. In
this confirmatory run it selected a 1,403 ms effective interval:

- production default: 3 checks, 160.398 ms total, 3.5909% of refresh time;
- diagnostic every-batch mode: 120 checks, 6,745.654 ms total, 60.0632%;
- explicit `sourceDriftCheckIntervalMs: 0` remains an unthrottled diagnostic
  override.

## Visual graph fidelity

The bounded visual fixture contained 40 files and 39 directed import edges.
The emitted interactive scene preserved:

- 40/40 files;
- 39/39 expected edges;
- zero spurious edges;
- valid endpoints for every edge; and
- finite, unique positions for every scene object.

This proves graph-to-scene topology fidelity on the synthetic fixture. It does
not prove that literal pixels improve agent answers. That claim remains gated
by the preregistered Paper 5 visual protocol, external annotations, independent
vision-model families, and model-version custody receipts.

## Paper measurements

Paper 5 used the frozen 54-query development corpus:

| System | Precision@5 | MRR |
|---|---:|---:|
| Keyword-only | 0.200 | 0.449 |
| HoloEmbed semantic-only | 0.093 | 0.240 |
| Hybrid | 0.185 | 0.458 |
| GraphRAG | 0.193 | 0.463 |

Against the legacy structural-vector floor, the current HoloEmbed GraphRAG arm
improved Precision@5 by 0.056 and MRR by 0.073. These remain
development-corpus measurements, not publication-ready external replication.

Paper 5 synthetic end-to-end timing was 0.457 ms median and 1.148 ms p95.
Paper 26 HoloGraph and HoloEmbed tests passed; their synthetic scope and claim
boundaries are preserved in the unified receipt.

## Validation

- `pnpm --filter @holoscript/absorb-service test`: 1,364 passed, one skipped.
- `pnpm --filter @holoscript/absorb-service build`: passed.
- Targeted ESLint: zero errors; existing warnings remain.
- Unified HoloAbsorb rebenchmark: ten of ten stages passed.
