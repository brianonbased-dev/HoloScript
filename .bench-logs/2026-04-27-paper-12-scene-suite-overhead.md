# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead

- Date: 2026-04-27
- Suite: 5 scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)
- Iterations per measurement: see code (PAPER12_QUICK env supported)
- Wall-clock: 252.9 ms
- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.

## Per-scene measurements

| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |
|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|
| tiny | 1 | 0 | 1 | 0.0390 | 0.0414 | 1.060 | 0.0332 | 16 |
| small | 1 | 4 | 6 | 0.1534 | 0.0410 | 0.267 | 0.0291 | 17 |
| medium | 5 | 2 | 20 | 0.0871 | 0.0652 | 0.749 | 0.0826 | 37 |
| large | 20 | 4 | 120 | 0.3968 | 0.3816 | 0.962 | 0.4289 | 132 |
| plugin-heavy | 10 | 4 | 60 | 0.2016 | 0.1328 | 0.658 | 0.1084 | 72 |

## Suite aggregates

| Metric | mean | median | p95 | max |
|--------|------|--------|-----|-----|
| HoloScript cold parse (ms) | 0.1756 | 0.1534 | 0.3968 | 0.3968 |
| HoloScript warm parse (ms) | 0.1324 | 0.0652 | 0.3816 | 0.3816 |
| OpenUSD plugin export (ms) | 0.1364 | 0.0826 | 0.4289 | 0.4289 |

## Methodology

Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.

## Source

- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts`
- Sibling probe: `packages/comparative-benchmarks/src/paper12PluginProbe.ts` (single-scene reference)
