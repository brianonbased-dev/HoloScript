# HoloAbsorb Rebenchmark — 2026-07-26

Status: **PASS**, with bounded claims.

This run is the first unified HoloAbsorb receipt after the transport, cache
authority, isolated-worker, HoloEmbed, and GraphRAG improvements. It records the
repository commit/worktree state, hardware, exact commands, subprocess logs,
umbrella/thread audit, Paper 5 retrieval and timing artifacts, and Paper 26
HoloGraph/HoloEmbed tests.

Canonical receipt:
[`holoabsorb-rebenchmark.json`](./holoabsorb-rebenchmark.json)

## Hardware

- Windows x64, Node 24.15.0
- Intel i7-11800H, 16 logical CPUs
- 32 GiB system memory
- NVIDIA GeForce RTX 3060 Laptop GPU, 6 GiB

The Paper 5 timing runner classified this as `ci-reference`; it did not claim a
verified RTX 3060 publication capture because the explicit acceptance flag was
not set.

## Paper 5 — Current HoloEmbed vs Legacy Structural Floor

Corpus: 152 files, 7,218 symbols. Query set: 10 hand-authored queries with all
10 gold files present.

| Retrieval path | HoloEmbed P@5 | Structural P@5 | HoloEmbed MRR | Structural MRR | MRR delta |
| --- | ---: | ---: | ---: | ---: | ---: |
| Semantic only | 0.140 | 0.000 | 0.484 | 0.038 | +0.446 |
| GraphRAG | 0.040 | 0.000 | 0.116 | 0.010 | +0.106 |
| Keyword-only control | 0.180 | 0.180 | 0.763 | 0.763 | 0.000 |

Interpretation:

- HoloEmbed materially improves both semantic and GraphRAG retrieval over the
  legacy structural-only floor.
- Current GraphRAG reranking still reduces MRR from the HoloEmbed semantic
  result (0.484) to 0.116 and remains below the keyword control (0.763).
- This supports the existing hybrid/exact-name retrieval task
  `task_1785005981387_lot7`; it does not justify a duplicate task.
- The query set remains a bootstrap. Paper 5's publication target still needs
  at least 50 independently labeled dependency, impact, and reasoning queries.
  That work remains under `task_1784368626374_6bib`.

Timing receipt (100 bounded synthetic trials):

| Stage | Median | p95 |
| --- | ---: | ---: |
| Keyword | 0.105 ms | 0.271 ms |
| Graph traversal | 0.006 ms | 0.017 ms |
| Embedding generation | 0.224 ms | 0.431 ms |
| Vector search | 0.106 ms | 0.293 ms |
| Envelope build | 0.007 ms | 0.020 ms |
| End to end | 0.460 ms | 1.111 ms |

These are synthetic CI-reference timings, not GPU-kernel or Jetson throughput
claims.

## Paper 26 — HoloGraph and HoloEmbed

HoloGraph EventEdge results:

| Files | Symbols | Events | HoloGraph query | Embedding query | HoloGraph recall | Embedding recall@10 | Speedup |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 50 | 200 | 10 | 0.170 µs | 325.0 µs | 1.000 | 0.050 | 1,912.0× |
| 500 | 2,000 | 50 | 0.115 µs | 2,081.7 µs | 1.000 | 0.013 | 18,101.5× |
| 2,000 | 8,000 | 100 | 0.085 µs | 10,316.2 µs | 1.000 | 0.000 | 121,367.6× |

Name-derived NL→code recall@10 on the 50-symbol synthetic corpus:

- Structural: 10.0%
- HoloEmbed: 100.0%

The optional Xenova model-download ablation was not run, so this receipt makes
no Xenova comparison.

## Umbrella and Thread Audit

The audit passed:

- 10 canonical HoloAbsorb capability owners
- 27 declared tool names with one owner each
- 26 observed evidence paths
- 2 paper evidence contracts
- 6 workstreams represented on the live HoloMesh snapshot

Thread reconciliation:

- `task_1783461928336_vxjh` and `task_1783462811392_lfx2` are an overlap
  candidate and should converge into one HoloAbsorb promotion gate.
- Checkpoint reuse and checkpoint-retention benchmarking are parent/child
  work, not duplicates.
- The recent worker-memory and multi-root tasks require source/commit
  reconciliation before new implementation because recent reliability commits
  may already satisfy part of their scope.

## Claim Boundary

This receipt proves that the current harnesses ran successfully on the recorded
host and reports their measurements. It does not convert synthetic or bootstrap
experiments into production-corpus, publication-scale, RTX 3060 capture, or
Jetson/fleet claims.
