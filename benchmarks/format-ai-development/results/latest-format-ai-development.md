# HoloScript Format AI-Development Benchmark

Generated: 2026-06-27T19:45:00.000Z
Schema: `holoscript.format-ai-development-benchmark.v0.1.0`

## Claim Status

**format-level support, productivity claim still unproven**

| Metric                                   | Value |
| ---------------------------------------- | ----: |
| Core formats present                     |   yes |
| Constructs / 1000 tokens                 | 14.18 |
| Best handwritten token compression ratio | 3.16x |

## Summary By Format

| Format  | Files |  Lines |  Tokens | Constructs | Constructs / 1000 tokens | Avg unique traits/file |
| ------- | ----: | -----: | ------: | ---------: | -----------------------: | ---------------------: |
| .holo   |  2256 | 186572 | 1707728 |      20862 |                    12.22 |                   4.63 |
| .hs     |    72 |  16253 |  136282 |        860 |                     6.31 |                   2.74 |
| .hsplus |  2444 | 111179 |  897359 |      17163 |                    19.13 |                   5.53 |

## Handwritten Baseline Compression

| Scenario       | Baseline           | Native tokens | Handwritten tokens | Token ratio | Line ratio |
| -------------- | ------------------ | ------------: | -----------------: | ----------: | ---------: |
| 01-basic-scene | unity-handwritten  |           512 |                837 |       1.63x |      1.51x |
| 01-basic-scene | unreal-handwritten |           512 |               1616 |       3.16x |         3x |

## Interpretation

- This benchmark supports a narrow claim: HoloScript formats give agents dense, structured, machine-readable substrate compared with handwritten platform code where paired baselines exist.
- It does not yet prove the broad claim that HoloScript changes AI development productivity. That requires LLM task, repair, and human workflow benchmarks.
- The next benchmark should freeze tasks and compare `.holo`, `.hsplus`, `.hs`, TypeScript, and prose on valid-output rate, repair attempts, tokens spent, and wall time.

## Top Semantic-Density Files

| File                                                                    | Format  | Tokens | Constructs / 1000 tokens | Unique traits |
| ----------------------------------------------------------------------- | ------- | -----: | -----------------------: | ------------: |
| examples/services/cross-domain-service.holo                             | .holo   |    551 |                    88.93 |            43 |
| packages/core/src/runtime/system_variables.hsplus                       | .hsplus |    171 |                    87.72 |            10 |
| packages/core/src/semantics/property_annotations.hsplus                 | .hsplus |    156 |                    83.33 |             9 |
| packages/core/src/traits/semantic-2d/dynamic_visual.holo                | .holo   |     75 |                       80 |             5 |
| packages/studio/holo-pages/start/page.holo                              | .holo   |     15 |                    66.67 |             1 |
| examples/services/user-api-contract.holo                                | .holo   |    501 |                    63.87 |            12 |
| examples/integration/layered-architecture-demo/components/button.hsplus | .hsplus |    141 |                    63.83 |             5 |
| packages/studio/holo-pages/learn/page.holo                              | .holo   |     16 |                     62.5 |             1 |
| packages/studio/holo-pages/templates/page.holo                          | .holo   |     16 |                     62.5 |             1 |
| packages/studio/holo-pages/pipeline/page.holo                           | .holo   |     98 |                    61.22 |             4 |
