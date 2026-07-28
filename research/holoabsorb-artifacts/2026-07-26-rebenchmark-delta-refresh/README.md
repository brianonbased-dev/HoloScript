# HoloAbsorb Rebenchmark — Changed-Symbol Refresh

Status: **PASS**, with bounded claims.

This receipt was captured from HoloScript commit
`a6ee583ee13c3fdfa3097c204b1c1028685ad341` after the changed-symbol embedding
reuse and compact MCP graph-result work landed.

Canonical receipt:
[`holoabsorb-rebenchmark.json`](./holoabsorb-rebenchmark.json)

## Refresh and transport gate

The deterministic Git fixture contained 120 files and 2,880 initial symbols.
The second forced scan changed 15 files and produced 2,895 symbols.

| Measurement              |                      Result |
| ------------------------ | --------------------------: |
| Reused embeddings        |      2,880 / 2,895 (99.48%) |
| Newly embedded symbols   |                          15 |
| Compact refresh response |                 5,866 bytes |
| Atomic graph cache       |             1,097,398 bytes |
| Refresh peak RSS delta   | 48,525,312 bytes (46.3 MiB) |
| Full build wall time     |                  2,240.1 ms |
| Forced refresh wall time |                  3,092.3 ms |

All transport checks passed:

- Neither the initial nor refreshed MCP-shaped result contained the serialized
  graph.
- Both direct responses remained below the 64 KiB gate.
- The complete graph and embedding generation remained available in the atomic
  cache.
- Status and graph queries passed after a simulated process restart.
- The refresh stayed below the benchmark's 512 MiB peak-RSS-delta ceiling.

The wall-time result is intentionally not framed as a speedup: on this small
synthetic fixture, rescanning, deserializing, and atomically publishing the
cache dominate the 15-vector embedding delta. The receipt proves elimination
of the whole-index re-embed and retained MCP payload, not production-monorepo
throughput.

## Paper 5 — retrieval quality and timing

Corpus: 152 files, 7,264 symbols. The query set remains the 10-query bootstrap.

| Retrieval path       | HoloEmbed P@5 | Structural P@5 | HoloEmbed MRR | Structural MRR |
| -------------------- | ------------: | -------------: | ------------: | -------------: |
| Semantic only        |         0.140 |          0.000 |         0.484 |          0.038 |
| GraphRAG             |         0.040 |          0.000 |         0.117 |          0.010 |
| Keyword-only control |         0.180 |          0.180 |         0.761 |          0.761 |

HoloEmbed continues to beat the legacy structural floor. The current GraphRAG
reranker still degrades the semantic result and remains below the keyword
control, so hybrid/exact-name retrieval work remains justified under the
existing task `task_1785005981387_lot7`.

Timing remained a synthetic CI-reference capture:

| Stage                |   Median |      p95 |
| -------------------- | -------: | -------: |
| Keyword              | 0.112 ms | 0.287 ms |
| Graph traversal      | 0.007 ms | 0.016 ms |
| Embedding generation | 0.259 ms | 0.605 ms |
| Vector search        | 0.114 ms | 0.180 ms |
| Envelope build       | 0.008 ms | 0.027 ms |
| End to end           | 0.503 ms | 1.330 ms |

## Paper 26 — HoloGraph and HoloEmbed

| Files | Symbols | Events | HoloGraph query | Embedding query | HoloGraph recall |    Speedup |
| ----: | ------: | -----: | --------------: | --------------: | ---------------: | ---------: |
|    50 |     200 |     10 |        0.160 µs |        371.1 µs |            1.000 |   2,319.5× |
|   500 |   2,000 |     50 |        0.105 µs |      2,715.0 µs |            1.000 |  25,857.5× |
| 2,000 |   8,000 |    100 |        0.100 µs |     10,590.3 µs |            1.000 | 105,903.0× |

Name-derived NL→code recall@10 on the 50-symbol synthetic corpus:

- Structural: 10.0%
- HoloEmbed: 100.0%

The optional Xenova model-download ablation was not run, so no Xenova
comparison is claimed.

## Remaining measured gaps

- Replace the harmful GraphRAG reranking behavior with a hybrid exact-name,
  keyword, semantic, and graph fusion strategy.
- Expand Paper 5 to at least 50 independently labeled dependency, impact, and
  reasoning queries under `task_1784368626374_6bib`.
- Benchmark full-scan/checkpoint publication costs separately from embedding
  generation on the real monorepo and target fleet hardware.
- Capture verified RTX 3060 and Jetson/Orin timing receipts before making
  hardware-specific publication claims.
