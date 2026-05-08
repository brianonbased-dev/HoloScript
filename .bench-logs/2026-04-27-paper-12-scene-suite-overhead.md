# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead

- Date: 2026-04-27
- Suite: 5 scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)
- Iterations per measurement: see code (PAPER12_QUICK env supported)
- Wall-clock: 242.3 ms
- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.

## Per-scene measurements

| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |
|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|
| tiny | 1 | 0 | 1 | 0.0288 | 0.0167 | 0.580 | 0.0062 | 12 |
| small | 1 | 4 | 6 | 0.0486 | 0.0453 | 0.930 | 0.0070 | 13 |
| medium | 5 | 2 | 20 | 0.1064 | 0.1025 | 0.963 | 0.0210 | 29 |
| large | 20 | 4 | 120 | 0.4138 | 0.5002 | 1.209 | 0.2736 | 109 |
| plugin-heavy | 10 | 4 | 60 | 0.2330 | 0.1495 | 0.642 | 0.0433 | 59 |

## Suite aggregates

| Metric | mean | median | p95 | max |
|--------|------|--------|-----|-----|
| HoloScript cold parse (ms) | 0.1661 | 0.1064 | 0.4138 | 0.4138 |
| HoloScript warm parse (ms) | 0.1628 | 0.1025 | 0.5002 | 0.5002 |
| OpenUSD plugin export (ms) | 0.0702 | 0.0210 | 0.2736 | 0.2736 |

## Methodology

Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.

## Source

- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts`
- Sibling probe: `packages/comparative-benchmarks/src/paper12PluginProbe.ts` (single-scene reference)
