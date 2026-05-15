# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead

- Date: 2026-04-27
- Suite: 5 scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)
- Iterations per measurement: see code (PAPER12_QUICK env supported)
- Wall-clock: 175.8 ms
- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.

## Per-scene measurements

| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |
|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|
| tiny | 1 | 0 | 1 | 0.0230 | 0.0154 | 0.670 | 0.0244 | 16 |
| small | 1 | 4 | 6 | 0.0316 | 0.0235 | 0.746 | 0.0314 | 17 |
| medium | 5 | 2 | 20 | 0.0887 | 0.0481 | 0.542 | 0.0733 | 37 |
| large | 20 | 4 | 120 | 0.3175 | 0.3375 | 1.063 | 0.2197 | 132 |
| plugin-heavy | 10 | 4 | 60 | 0.1062 | 0.0750 | 0.707 | 0.0786 | 72 |

## Suite aggregates

| Metric | mean | median | p95 | max |
|--------|------|--------|-----|-----|
| HoloScript cold parse (ms) | 0.1134 | 0.0887 | 0.3175 | 0.3175 |
| HoloScript warm parse (ms) | 0.0999 | 0.0481 | 0.3375 | 0.3375 |
| OpenUSD plugin export (ms) | 0.0854 | 0.0733 | 0.2197 | 0.2197 |

## Methodology

Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.

## Source

- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts`
- Sibling probe: `packages/comparative-benchmarks/src/paper12PluginProbe.ts` (single-scene reference)
