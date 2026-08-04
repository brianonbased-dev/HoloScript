# HoloAbsorb post-convergence rebenchmark

Status: **PASS**, with explicit structured-visual, synthetic-workload, and
publication-readiness boundaries.

This clean-worktree run evaluates HoloAbsorb after graph-cache authority,
incremental completeness repair, bounded embedding refresh, transport
lifecycle hardening, and graph-focused retrieval changes. All eleven stages
completed successfully in 264.9 seconds at commit
`700365e1f76fb9cc5134d883723d0aec3b4dcaa1`.

Primary machine-readable receipt:
[`holoabsorb-rebenchmark.json`](./holoabsorb-rebenchmark.json)

Receipt SHA-256:
`ce8af8eece9f04843d0900e2c55518c08ce4e23976321db7d6eabbe2f3330f45`

## Gates

| Stage                                | Result | Duration |
| ------------------------------------ | -----: | -------: |
| Sequential scan determinism          |   PASS | 45.772 s |
| Frozen Paper 5 dataset audit         |   PASS |  0.235 s |
| HoloAbsorb umbrella/workstream audit |   PASS |  0.777 s |
| Sovereign transport resilience       |   PASS |  1.028 s |
| Changed-symbol refresh               |   PASS | 96.927 s |
| Structured visual focus              |   PASS | 40.204 s |
| Paper 5 HoloEmbed retrieval          |   PASS | 40.227 s |
| Paper 5 structural floor             |   PASS | 31.264 s |
| Paper 5 bounded timing               |   PASS |  0.431 s |
| Paper 26 HoloGraph regression        |   PASS |  4.406 s |
| Paper 26 HoloEmbed regression        |   PASS |  2.660 s |

## Transport and refresh

The synthetic transport-lifecycle benchmark passed all seven checks with no
false-positive reap candidates. At 4,096 synthetic connections it measured
20.428 ms median, 25.019 ms p95, and 27.591 ms p99. This is not network
throughput or end-to-end MCP latency.

The changed-symbol fixture refreshed 15 changed files while reusing 2,880 of
2,895 embeddings, a `0.994819` reuse ratio. Authority-safe incomplete-cache
repair parsed exactly 15 of 15 missing files in the normal fixture and 5 of 5
missing files in the 2,000-file scale fixture. Both results were authoritative
and source-pinned.

The repair lanes were slower than their full-refresh comparators in this run:
`0.866x` for the normal fixture and `0.901x` for the scale fixture. Their
demonstrated benefit is bounded, integrity-preserving repair rather than a
latency speedup. The memory guard refused before mutation and preserved the
exact cache hash. A three-commit source-churn run detected and retried all three
drifts before publishing the newest authoritative graph.

## Structured visual graph evidence

The 20-case duplicate-symbol study measured:

| Arm                       |   MRR | Top-1 | Mean rank |
| ------------------------- | ----: | ----: | --------: |
| No selection              | 0.286 |    0% |      6.05 |
| Correct resolved selection| 0.975 |   95% |      1.05 |
| Stale unresolved selection| 0.286 |    0% |      6.05 |
| Wrong resolved selection  | 0.310 |    0% |         - |

Stale selection failed closed with a 100% exact ranking match to the baseline.
Wrong resolved selections followed caller intent and produced a 5% harmful
override rate. The evidence covers structured `graph.holo` selection intent
over duplicate symbols. It does not establish benefit from literal pixels or
human-like visual perception.

The separate visual-v4 readiness receipt is `blocked`, not failed. Its
deterministic PNG and actual-image content-part implementation checks pass, but
the external dataset, independent annotations, three receipted vision model
families, and three trials per arm have not been supplied.

## Paper boundaries

Paper 5 used 54 frozen held-out queries over 125 files and 6,821 symbols:

| System                  | Precision@5 |   MRR |
| ----------------------- | ----------: | ----: |
| Keyword-only            |       0.204 | 0.451 |
| HoloEmbed semantic-only |       0.096 | 0.269 |
| HoloEmbed hybrid        |       0.181 | 0.459 |
| HoloEmbed GraphRAG      |       0.178 | 0.463 |

The receipt remains `publicationReady: false`: it lacks independent
multi-human annotation, external-codebase replication, and inter-annotator
agreement. The 0.446 ms median / 1.137 ms p95 timing result is a synthetic
CI-reference capture, not verified RTX 3060 or Jetson performance.

Paper 26 synthetic regressions passed. HoloGraph event recall remained `1.0`
at 50, 500, and 2,000 files. The name-derived NL-code Recall@10 result was
`1.0` for HoloEmbed versus `0.1` for the structural baseline. These results do
not establish general production-code performance.

## Included receipts

- [`holoabsorb-refresh-benchmark.json`](./holoabsorb-refresh-benchmark.json) —
  SHA-256 `a9fe554d72b9ec8dc3414b4e2131df379aefe43e6cee2aac1835fb968a795f09`
- [`holoabsorb-hybrid-visual-focus.json`](./holoabsorb-hybrid-visual-focus.json) —
  SHA-256 `a4712b6f9f2d121511ae17df48b9b39430fbcd30a766655be0b30710785b11f0`
- [`holoabsorb-transport-resilience.json`](./holoabsorb-transport-resilience.json) —
  SHA-256 `37093fa526c9b0f67961418514821ac29d735e34bbd8d7e3e584d97086adf3ce`
- [`paper-5-visual-v4-readiness.json`](./paper-5-visual-v4-readiness.json) —
  SHA-256 `c1e518002d25a027e74359ba5ddd2519d5e4b72163eb58cbcc686960c5b7733b`
