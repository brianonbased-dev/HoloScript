# HoloAbsorb Paper 5 source-audited evaluation

Status: **PASS as an implementation-stage evaluation; not publication-ready.**

The admitted clean-tree run is
[`holoabsorb-rebenchmark.json`](./holoabsorb-rebenchmark.json) at HoloScript
commit `be3e7ba2c90cd653fe2ceaef826731c99cbafa37`. All nine unified stages
passed: scan determinism, dataset audit, HoloAbsorb umbrella audit,
changed-symbol refresh, both Paper 5 accuracy arms, Paper 5 timing, and
both Paper 26 tests.

## Protocol

- Frozen dataset:
  `packages/absorb-service/benchmarks/paper-5-retrieval-v1.json`
- Dataset SHA-256:
  `f34a3664fd8c39ff5cc5b38201b72d8d02b6633990f2c67f4e43cc03bd1314dd`
- Dataset source commit:
  `ca8da44d2b7a9e221d39b84886e3b0e65c7660f8`
- 54 held-out queries: 18 dependency, 18 impact, 18 reasoning
- 160 multi-relevance judgments and 173 source anchors
- Corpus: 125 source files, 6,555 symbols, zero scan errors
- Accuracy-arm symbol corpus SHA-256:
  `d21942f26ddf0a1302e71613632e68f65ca07ce3179f3d767ce402a7e191e49d`
- Two-scan determinism gate: PASS, zero differing files
- Metrics: P@5 and MRR with 2,000 deterministic bootstrap resamples, 95%
  confidence intervals, seed 260727

The executable dataset audit runs before ranking and rejects missing source
anchors, filename leakage, duplicate queries, unbalanced categories, fewer
than 50 queries, fewer than two relevance judgments per query, or protocol
drift.

## Measured accuracy

| System                   |         P@5 (95% CI) |         MRR (95% CI) | Paired P@5 delta vs lexical | Paired MRR delta vs lexical |
| ------------------------ | -------------------: | -------------------: | --------------------------: | --------------------------: |
| Keyword-only             | 0.196 [0.156, 0.237] | 0.449 [0.350, 0.548] |        0.000 [0.000, 0.000] |        0.000 [0.000, 0.000] |
| HoloEmbed semantic-only  | 0.093 [0.063, 0.122] | 0.241 [0.160, 0.326] |     -0.104 [-0.148, -0.059] |     -0.208 [-0.324, -0.088] |
| HoloEmbed hybrid         | 0.181 [0.141, 0.222] | 0.458 [0.351, 0.574] |      -0.015 [-0.063, 0.033] |      +0.010 [-0.141, 0.162] |
| HoloEmbed GraphRAG       | 0.193 [0.152, 0.233] | 0.459 [0.345, 0.570] |      -0.004 [-0.056, 0.041] |      +0.010 [-0.140, 0.161] |
| Structural semantic-only | 0.059 [0.033, 0.089] | 0.173 [0.095, 0.256] |     -0.137 [-0.185, -0.089] |     -0.275 [-0.400, -0.149] |
| Structural hybrid        | 0.144 [0.107, 0.181] | 0.418 [0.304, 0.535] |     -0.052 [-0.100, -0.004] |      -0.030 [-0.183, 0.124] |
| Structural GraphRAG      | 0.133 [0.100, 0.170] | 0.389 [0.278, 0.503] |     -0.063 [-0.111, -0.015] |      -0.059 [-0.206, 0.085] |

HoloEmbed GraphRAG is statistically tied with the lexical baseline in the
aggregate. It is strongest on impact questions (P@5 0.244, MRR 0.644), versus
the lexical impact result of 0.211/0.419. Dependency and reasoning performance
erase that category-level gain. This identifies a routing opportunity, not an
aggregate superiority claim.

## Dependability defect found and fixed

The first expanded runs exposed provider-independent keyword drift. The cause
was `BaseAdapter.getPreviousSibling()` using JavaScript object identity to
match tree-sitter nodes. Native bindings can return fresh wrappers for the same
node, causing large files to intermittently lose doc comments and therefore
change embeddings and rankings.

The implementation now matches nodes by stable byte position. A wrapper-churn
unit test protects the behavior, and `verify-scan-determinism.mjs` makes two
identical full scans a mandatory unified-rebenchmark gate.

## Other admitted measurements

- Changed-symbol refresh: 2,880/2,895 symbols reused (0.994819), 15 embedded,
  zero retired; fresh-process status and query checks passed.
- Paper 5 CI-reference timing: 0.417 ms median and 1.022 ms p95 end-to-end on
  the bounded synthetic workload.
- Paper 26 synthetic event lookup and recall tests passed. The optional Xenova
  model-download ablation was not run.

## Claim boundary

This corpus clears the 50-query, category-balance, multi-relevance,
source-audit, deterministic-scan, and confidence-interval implementation
gates. It does **not** have independent multi-human relevance annotation,
inter-annotator agreement, or external-codebase replication. Those remain
required before publication.
