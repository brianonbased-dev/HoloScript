# Paper-12 §"Remaining Work" item 1 — Scene-Suite Plugin-Loaded Overhead

- Date: 2026-04-27
- Suite: 5 scenes × 2 target paths (HoloScript parser + OpenUSD plugin export)
- Iterations per measurement: see code (PAPER12_QUICK env supported)
- Wall-clock: 239.0 ms
- Item 2 (structural-biology USD comparison) is split into a separate board task — NOT covered here.

## Per-scene measurements

| Scene | Objects | Traits/Obj | Holo LOC | Cold parse mean (ms) | Warm parse mean (ms) | Warm/Cold | USD export mean (ms) | USD plugin LOC |
|-------|---------|------------|----------|----------------------|----------------------|-----------|----------------------|----------------|
| tiny | 1 | 0 | 1 | 0.0308 | 0.0219 | 0.712 | 0.0053 | 12 |
| small | 1 | 4 | 6 | 0.1154 | 0.0578 | 0.501 | 0.0099 | 13 |
| medium | 5 | 2 | 20 | 0.2360 | 0.0925 | 0.392 | 0.0331 | 29 |
| large | 20 | 4 | 120 | 0.4890 | 0.3143 | 0.643 | 0.0838 | 109 |
| plugin-heavy | 10 | 4 | 60 | 0.1606 | 0.1850 | 1.152 | 0.0417 | 59 |

## Suite aggregates

| Metric | mean | median | p95 | max |
|--------|------|--------|-----|-----|
| HoloScript cold parse (ms) | 0.2064 | 0.1606 | 0.4890 | 0.4890 |
| HoloScript warm parse (ms) | 0.1343 | 0.0925 | 0.3143 | 0.3143 |
| OpenUSD plugin export (ms) | 0.0348 | 0.0331 | 0.0838 | 0.0838 |

## Methodology

Per scene, cold-path parse uses a fresh root identifier each iteration (defeating parser memoization); warm-path uses a single fixed source string. OpenUSD plugin export runs the @holoscript/openusd-plugin pipeline on the same conceptual scene shape. Mean = arithmetic mean over N iterations after an 8-iter warmup. Suite aggregates reduce the per-scene means via mean / median / p95 / max across the 5-scene suite.

## Source

- Harness: `packages/comparative-benchmarks/src/__tests__/paper-12-scene-suite-overhead.bench.test.ts`
- Sibling probe: `packages/comparative-benchmarks/src/paper12PluginProbe.ts` (single-scene reference)
