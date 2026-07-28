# HoloAbsorb post-transport rebenchmark

Status: **PASS**, with the existing Paper 5 and Paper 26 claim boundaries.

This clean-worktree run evaluates HoloAbsorb after the sovereign MCP heartbeat,
registry-indexing, and transport fault-benchmark changes. All ten stages
completed successfully in 105.9 seconds at commit
`f77bacda3fb1ce9dc0128c86e0d0b37aa62e0c2d`.

Primary machine-readable receipt:
[`holoabsorb-rebenchmark.json`](./holoabsorb-rebenchmark.json)

Receipt SHA-256:
`d729e4dcc30210a176e2029fb7b0b18fb41ac9d43606776f58c04de2bdd3cef7`

## Gates

| Stage                                | Result | Duration |
| ------------------------------------ | -----: | -------: |
| Sequential scan determinism          |   PASS | 37.608 s |
| Frozen Paper 5 dataset audit         |   PASS |  0.130 s |
| HoloAbsorb umbrella/workstream audit |   PASS |  0.540 s |
| Sovereign transport resilience       |   PASS |  1.098 s |
| Changed-symbol refresh               |   PASS |  8.508 s |
| Paper 5 HoloEmbed retrieval          |   PASS | 25.658 s |
| Paper 5 structural floor             |   PASS | 26.346 s |
| Paper 5 bounded timing               |   PASS |  0.344 s |
| Paper 26 HoloGraph regression        |   PASS |  3.651 s |
| Paper 26 HoloEmbed regression        |   PASS |  1.557 s |

## Transport and refresh

The integrated 25-sample transport stage passed all seven fault checks. At
4,096 synthetic connections it measured:

- median: 22.492 ms;
- p95: 29.578 ms;
- p99: 33.604 ms; and
- false-positive reap candidates: 0.

The changed-symbol fixture refreshed 15 changed files while reusing 2,880 of
2,895 embeddings, a `0.994819` reuse ratio. The fresh-process graph remained
authoritative and matched the fixture Git head. All response-size, memory,
cache, and freshness checks passed.

## Paper 5 retrieval

The run used the source-audited held-out v1 dataset: 54 queries balanced
18/18/18 across dependency, impact, and reasoning, with 160 relevance
judgments and no missing gold files.

| System                  | Precision@5 |   MRR |
| ----------------------- | ----------: | ----: |
| Keyword-only            |       0.196 | 0.449 |
| HoloEmbed semantic-only |       0.093 | 0.241 |
| HoloEmbed hybrid        |       0.181 | 0.458 |
| HoloEmbed GraphRAG      |       0.193 | 0.459 |

These values exactly reproduce the admitted
`2026-07-26-paper5-source-audited-v1` receipt. Relative to the structural
embedding floor, the current HoloEmbed arm measured raw gains of `+0.034`
Precision@5 / `+0.068` MRR for semantic-only, `+0.037` / `+0.040` for hybrid,
and `+0.060` / `+0.070` for GraphRAG.

GraphRAG did not establish superiority over keyword retrieval: its paired
delta was `-0.004` Precision@5 with 95% CI `[-0.056, 0.041]` and `+0.010` MRR
with 95% CI `[-0.140, 0.161]`. The receipt remains
`publicationReady: false`.

The 100-trial bounded timing harness measured 0.451 ms median and 1.095 ms p95
end-to-end. Its capture class is `ci-reference`; it is not a verified GPU or
production-monorepo latency capture.

## Paper 26 regressions

Both regression suites passed:

- HoloGraph event recall remained `1.0` across the 50-, 500-, and 2,000-file
  synthetic corpora.
- HoloEmbed name-derived NL-code Recall@10 remained `1.0`, versus `0.1` for
  the structural baseline.

The event corpora and NL-code query set are synthetic. Their latency ratios
and recall values do not establish general production-code performance.

## Visual graph boundary

This run preserves, but does not expand, the existing visual evidence:

- the v3 known-development-corpus study found diagnostic benefit from explicit
  relational graph text; and
- the v4 protocol still requires literal image pixels, at least three external
  codebases, at least 90 independently labeled queries, three model families,
  and three trials per arm.

No literal-pixel visual-agent accuracy claim is made by this receipt.
