# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead

- Date: 2026-04-27
- Suite: 5 scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)
- Iterations per measurement: see code (PAPER12_QUICK env supported)
- Wall-clock: 231.8 ms
- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.

## Per-scene measurements

| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |
|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|
| tiny | 1 | 0 | 1 | 0.0360 | 0.0202 | 0.560 | 0.0053 | 12 |
| small | 1 | 4 | 6 | 0.0895 | 0.0798 | 0.891 | 0.0091 | 13 |
| medium | 5 | 2 | 20 | 0.2046 | 0.1084 | 0.530 | 0.0279 | 29 |
| large | 20 | 4 | 120 | 0.4479 | 0.2796 | 0.624 | 0.0770 | 109 |
| plugin-heavy | 10 | 4 | 60 | 0.1801 | 0.1625 | 0.903 | 0.0459 | 59 |

## Suite aggregates

| Metric | mean | median | p95 | max |
|--------|------|--------|-----|-----|
| HoloScript cold parse (ms) | 0.1916 | 0.1801 | 0.4479 | 0.4479 |
| HoloScript warm parse (ms) | 0.1301 | 0.1084 | 0.2796 | 0.2796 |
| OpenUSD plugin export (ms) | 0.0330 | 0.0279 | 0.0770 | 0.0770 |

## Methodology

Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.

## Source

- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts`
- Sibling probe: `packages/comparative-benchmarks/src/paper12PluginProbe.ts` (single-scene reference)
