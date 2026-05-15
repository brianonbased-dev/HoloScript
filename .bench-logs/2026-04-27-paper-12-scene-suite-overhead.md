# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead

- Date: 2026-04-27
- Suite: 5 scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)
- Iterations per measurement: see code (PAPER12_QUICK env supported)
- Wall-clock: 202.6 ms
- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.

## Per-scene measurements

| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |
|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|
| tiny | 1 | 0 | 1 | 0.0231 | 0.0145 | 0.630 | 0.0226 | 16 |
| small | 1 | 4 | 6 | 0.0387 | 0.0295 | 0.761 | 0.0292 | 17 |
| medium | 5 | 2 | 20 | 0.0971 | 0.0575 | 0.592 | 0.0722 | 37 |
| large | 20 | 4 | 120 | 0.3754 | 0.2808 | 0.748 | 0.2868 | 132 |
| plugin-heavy | 10 | 4 | 60 | 0.1333 | 0.1040 | 0.780 | 0.2278 | 72 |

## Suite aggregates

| Metric | mean | median | p95 | max |
|--------|------|--------|-----|-----|
| HoloScript cold parse (ms) | 0.1335 | 0.0971 | 0.3754 | 0.3754 |
| HoloScript warm parse (ms) | 0.0973 | 0.0575 | 0.2808 | 0.2808 |
| OpenUSD plugin export (ms) | 0.1277 | 0.0722 | 0.2868 | 0.2868 |

## Methodology

Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.

## Source

- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts`
- Sibling probe: `packages/comparative-benchmarks/src/paper12PluginProbe.ts` (single-scene reference)
