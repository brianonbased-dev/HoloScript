# HoloAbsorb committed-source resilience rebenchmark

Status: **PASS** across all ten unified stages.

This is the final provenance run for commit
`cb15f41af0081b92ec8767febdabf4199e1813f9`. The unified runner verified that
the worktree was clean before measurement.

Machine-readable receipts:

- [`holoabsorb-rebenchmark.json`](./holoabsorb-rebenchmark.json)
- [`holoabsorb-refresh-benchmark.json`](./holoabsorb-refresh-benchmark.json)
- [`holoabsorb-transport-resilience.json`](./holoabsorb-transport-resilience.json)
- [`paper-5-accuracy-holoembed.json`](./paper-5-accuracy-holoembed.json)
- [`paper-5-accuracy-structural.json`](./paper-5-accuracy-structural.json)
- [`paper-5-timing.json`](./paper-5-timing.json)

## Confirmed refresh behavior

- Three separate HEAD advances produced three detections and three successful
  replans.
- Three content-addressed checkpoint batches were reused.
- The final graph was published only for the latest HEAD.
- An impossible host-memory reserve was refused in 12.880 ms without replacing
  the prior cache.

Under this slower host window, the adaptive production cadence widened from its
1,000 ms configured floor to 1,467 ms. It ran two HEAD probes totaling 110.904
ms, or 2.0701% of the 5,357.504 ms refresh. The explicit every-batch diagnostic
mode ran 120 probes and spent 11,237.805 ms in them, demonstrating why it is not
the production default.

## Confirmed visual topology

The bounded graph-to-scene lane preserved all 40 fixture files and all 39
directed import edges, produced zero spurious edges, retained valid endpoints,
and assigned finite unique positions to every scene object.

This is topology-fidelity evidence, not a literal-pixel agent-superiority claim.
The latter remains gated by the preregistered Paper 5 external annotation and
independent vision-family protocol.

## Paper measurements

The frozen 54-query Paper 5 development corpus produced:

| System                  | Precision@5 |   MRR |
| ----------------------- | ----------: | ----: |
| Keyword-only            |       0.200 | 0.449 |
| HoloEmbed semantic-only |       0.093 | 0.240 |
| Hybrid                  |       0.185 | 0.458 |
| GraphRAG                |       0.193 | 0.463 |

Paper 26 HoloGraph and HoloEmbed tests passed. All synthetic and
development-corpus boundaries remain explicit in the unified receipt.

## Validation

- Full Absorb package: 1,364 tests passed; one skipped.
- Absorb package build: passed.
- Targeted ESLint: zero errors.
- Unified committed-source rebenchmark: ten of ten stages passed.
