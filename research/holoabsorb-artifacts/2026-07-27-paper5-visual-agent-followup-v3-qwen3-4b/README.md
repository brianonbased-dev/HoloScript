# HoloAbsorb relational graph engineering follow-up

Status: **engineering and format gate PASS; superiority claim ineligible**.

This v3 run follows the preserved v2 negative result. It separates two failure
modes observed there:

1. unconstrained output failed to return four case-keyed answers for one batch;
2. raw topology did not improve aggregate ranking.

V3 therefore compares text candidate cards, the v2-style raw topology
projection, and an explicit relational projection under strict JSON Schema
output. The relational projection contains directional imports, external
degree, opaque community peers, and bounded graph roles. It contains no
coordinates, relevance labels, source bodies, doc comments, or function
signatures.

The 54-query corpus is outcome-exposed from v2. This is an engineering
follow-up, not a fresh confirmatory experiment. Its accuracy estimates are
diagnostic and cannot establish that relational or visual graph evidence is
generally superior.

The measured surface remains agent-readable structured graph evidence. Literal
pixel or screenshot vision was not measured.

## Frozen protocol and receipts

- Protocol:
  `packages/absorb-service/benchmarks/paper-5-visual-agent-study-v3.json`
- Protocol SHA-256:
  `70e4b1930a96e6d4d708b6c8a3cc74fc32aea459f4f196a2322db4ad28946619`
- Frozen protocol and runner commit:
  `b2c219b146b0`
- Exact evaluated merge head:
  `d5e70c5c9745`
- Packet receipt:
  [`packets.json`](./packets.json)
- Packet-core SHA-256:
  `d745a89eeff06090f0571e51b28f41a81302bb279606988ce9154d3da980c536`
- Raw packet-file SHA-256:
  `3819f78d11ebf7551699a38c27e06632edfaf82d38e92611237270c0fe8d01cc`
- Result receipt:
  [`result.json`](./result.json)
- Result-core receipt SHA-256:
  `788730877f40ac6e27c7917a2c2b9a57db594ae490b2d46f158e2978c6749618`
- Raw result-file SHA-256:
  `b8c088197a82490f4052e107912fc994b051663a06fa2ec148f86268acfbaa1e`

The packet was generated twice after the merge and once during the model run.
All three generations reproduced the packet-core SHA-256 exactly. Independent
readback also reproduced both the packet-core and result-core receipt hashes.

## Execution

- Model: `/mnt/nvme/holo/models/qwen3-4b-instruct.gguf`
- Endpoint: owned Jetson OpenAI-compatible server
- Temperature: 0
- Trials per arm: 1
- Queries: 54, balanced 18/18/18 across dependency, impact, and reasoning
- Candidate cards: 8 per query; every source-audited relevant file present
- Requests: 42/42 complete, 14 per arm
- Case-arm responses: 162/162 complete
- Invalid responses: 0
- Unknown-candidate rate: 0 for every arm
- Retries: 0
- HoloScript corpus: 125 files, 6,555 graph symbols, 0 scan errors
- Setup time: 19,078.392 ms
- End-to-end runner time: 450,138.789 ms

The endpoint accepted the complete four-case strict JSON Schema before the run.
Observed maximum prompt tokens were 1,616 for text, 2,841 for topology, and
3,052 for relations. The largest prompt plus the frozen 512-token completion
reserve was 3,564 tokens, inside the 4,096-token server context.

## Aggregate diagnostic results

| Arm                        | Precision@5 |      MRR | Invalid rate | Mean latency/query |
| -------------------------- | ----------: | -------: | -----------: | -----------------: |
| Text candidate cards       |    0.211111 | 0.898148 |     0.000000 |       2,191.152 ms |
| Cards + raw topology       |    0.214815 | 0.944444 |     0.000000 |       2,778.790 ms |
| Cards + explicit relations |    0.288889 | 0.962963 |     0.000000 |       3,012.062 ms |

Paired diagnostic deltas on the known development corpus:

| Comparison               |     Precision@5 delta (95% CI) |             MRR delta (95% CI) |
| ------------------------ | -----------------------------: | -----------------------------: |
| Topology minus text      | 0.003704 [-0.029630, 0.037037] | 0.046296 [-0.037037, 0.129630] |
| Relations minus text     |  0.077778 [0.022222, 0.137037] |  0.064815 [0.000000, 0.148148] |
| Relations minus topology |  0.074074 [0.033333, 0.118519] |  0.018519 [0.000000, 0.055556] |

The relational Precision@5 intervals are positive on this already inspected
corpus. That is useful engineering evidence that the representation is worth a
fresh confirmation study; it is not confirmatory evidence itself. The
relational MRR intervals touch zero.

## Category diagnosis

| Category   | Text P@5 | Topology P@5 | Relations P@5 | Text MRR | Topology MRR | Relations MRR |
| ---------- | -------: | -----------: | ------------: | -------: | -----------: | ------------: |
| Dependency | 0.266667 |     0.244444 |      0.300000 | 0.944444 |     1.000000 |      1.000000 |
| Impact     | 0.200000 |     0.222222 |      0.288889 | 1.000000 |     0.944444 |      1.000000 |
| Reasoning  | 0.166667 |     0.177778 |      0.277778 | 0.750000 |     0.888889 |      0.888889 |

Strict output eliminated the v2 batch-shape failure without retries. Raw
topology remained close to text, while explicit relations improved
Precision@5 numerically in all three categories. This supports advancing the
relational representation to an independently labeled held-out study.

## Confirmation boundary

A superiority claim requires a new corpus whose labels and outcomes were
unseen during v3 design, independently annotated external codebases, at least
three independent model families, and three trials per arm. The frozen future
gate requires positive lower 95% confidence bounds for relational-minus-text
Precision@5 and MRR with no more than a 0.02 invalid-rate increase.

The next visual gate is separate: render the identical candidate subgraph to a
fixed screenshot or interactive viewport and evaluate it with a vision-capable
agent on the new held-out corpus. V3 does not make a literal-vision claim.
