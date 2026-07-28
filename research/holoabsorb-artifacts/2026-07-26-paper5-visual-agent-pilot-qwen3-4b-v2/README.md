# HoloAbsorb structured visual-graph agent pilot

Status: **execution FAIL; preregistered hypothesis not supported**.

This is a preserved negative result. It evaluates whether an agent ranks a
gold-complete, eight-candidate codebase view more accurately when the same
candidate cards also include a structured projection of HoloAbsorb's canonical
visual graph.

The measured surface is machine-readable graph structure, not screenshot
perception or literal pixel vision.

## Frozen protocol and receipts

- Protocol:
  `packages/absorb-service/benchmarks/paper-5-visual-agent-study-v2.json`
- Protocol SHA-256:
  `fcdbe0619b9f2132a9c7aeb7b0b5981a8cf3ee000405b2a2da0a656897a26d7c`
- Preregistration commit:
  `df05e2ef0876`
- Exact evaluated merge head:
  `6b1b40c3c`
- Packet receipt:
  [`packets.json`](./packets.json)
- Packet-core SHA-256:
  `da465183516456b39eccf8eb6ee29b66447aa3f510f88396b4bee713011936e6`
- Result receipt:
  [`result.json`](./result.json)
- Result-core receipt SHA-256:
  `c7d9bd3e7f54e84d091fe96cdb15c65cdab050e88c94b01503cc444bd70befec`
- Raw result-file SHA-256:
  `a062a72036e31fffe5eddad99205ab7b5793d8cd668298c06ee9952d5cc2a07b`

The packet was regenerated after the run on the same merge head and reproduced
the packet-core SHA-256 exactly.

## Execution

- Model: `/mnt/nvme/holo/models/qwen3-4b-instruct.gguf`
- Endpoint: owned Jetson OpenAI-compatible server
- Temperature: 0
- Trials per arm: 1
- Queries: 54, balanced 18/18/18 across dependency, impact, and reasoning
- Candidate cards: 8 per query; every source-audited relevant file present
- Requests: 28/28 complete
- Arm-responses: 108/108 produced
- Invalid arm-responses: 4, all in one visual dependency batch
- HoloScript corpus: 125 files, 6,555 graph symbols, 0 scan errors
- End-to-end runner time: 297,347.519 ms

The v2 result field `execution.setupMs` contains end-to-end runner time because
the runner captured it at closeout. The runner is corrected after this receipt
to report setup and wall time separately; the immutable v2 receipt is not
rewritten.

## Aggregate results

| Arm                             | Precision@5 |      MRR | Invalid rate | Mean latency/query |
| ------------------------------- | ----------: | -------: | -----------: | -----------------: |
| Text candidate cards            |    0.200000 | 0.888889 |     0.000000 |       2,152.386 ms |
| Cards + structured visual graph |    0.162963 | 0.814815 |     0.074074 |       2,860.403 ms |

Paired visual-minus-text deltas:

- Precision@5: -0.037037, paired bootstrap 95% CI
  [-0.062963, -0.011111].
- MRR: -0.074074, paired bootstrap 95% CI
  [-0.185185, 0.037037].
- Invalid-response rate: +0.074074, above the preregistered +0.02 ceiling.

The result therefore misses all three preregistered success gates. The
Precision@5 interval excludes zero in the harmful direction; the MRR interval
does not exclude zero.

## Category diagnosis

| Category   | Text P@5 | Visual P@5 | Text MRR | Visual MRR | Visual invalid |
| ---------- | -------: | ---------: | -------: | ---------: | -------------: |
| Dependency | 0.233333 |   0.133333 | 0.944444 |   0.666667 |       0.222222 |
| Impact     | 0.200000 |   0.177778 | 0.888889 |   0.888889 |       0.000000 |
| Reasoning  | 0.166667 |   0.177778 | 0.833333 |   0.888889 |       0.000000 |

All four invalid observations were dependency cases 05 through 08. After two
attempts, the model returned a single candidate array for a four-case batch
instead of the required case-keyed JSON object. The response cannot be
unambiguously mapped back to four questions, so it correctly remains invalid
rather than being salvaged.

The reasoning slice improved numerically, while the dependency slice degraded
enough to dominate the aggregate. This is diagnostic, model-specific pilot
evidence, not proof that visual graphs generally harm or help agents.

## What this changes

The earlier four-arm evaluation remains valid: when a correct collision-safe
visual node is already selected, HoloAbsorb resolves it and promotes the target
deterministically; stale IDs fail closed; wrong resolved IDs remain explicit
caller steering.

This pilot answers a different question. A small agent did not reliably infer a
better selection from raw coordinates, opaque communities, degrees, and
candidate-neighbor lists. The next protocol should therefore:

1. isolate format reliability from ranking quality with constrained structured
   output or one response object per query;
2. compare raw topology against query-adaptive relational summaries that name
   import direction and graph role without leaking labels;
3. keep a separate literal screenshot or interactive-viewport arm for a
   vision-capable agent; and
4. freeze a new protocol before running three independent model families and
   externally annotated codebases.

No threshold, label, packet, or result was changed after outcome inspection.
This single 4B model pilot is not publication-ready.
