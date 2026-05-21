# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead

- Date: 2026-04-27
- Suite: 5 scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)
- Iterations per measurement: see code (PAPER12_QUICK env supported)
- Wall-clock: 244.4 ms
- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.

## Per-scene measurements

| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |
|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|
| tiny | 1 | 0 | 1 | 0.0277 | 0.0167 | 0.603 | 0.0274 | 16 |
| small | 1 | 4 | 6 | 0.0456 | 0.0368 | 0.808 | 0.0953 | 17 |
| medium | 5 | 2 | 20 | 0.1443 | 0.0725 | 0.502 | 0.1025 | 37 |
| large | 20 | 4 | 120 | 0.4220 | 0.3089 | 0.732 | 0.4386 | 132 |
| plugin-heavy | 10 | 4 | 60 | 0.1939 | 0.1388 | 0.716 | 0.1198 | 72 |

## Suite aggregates

| Metric | mean | median | p95 | max |
|--------|------|--------|-----|-----|
| HoloScript cold parse (ms) | 0.1667 | 0.1443 | 0.4220 | 0.4220 |
| HoloScript warm parse (ms) | 0.1147 | 0.0725 | 0.3089 | 0.3089 |
| OpenUSD plugin export (ms) | 0.1567 | 0.1025 | 0.4386 | 0.4386 |

## Methodology

Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.

## Source

- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts`
- Sibling probe: `packages/comparative-benchmarks/src/paper12PluginProbe.ts` (single-scene reference)
