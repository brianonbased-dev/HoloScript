# Paper-12 plugin-loaded overhead + OpenUSD LOC — shipped probe

**Paper:** HoloLand I3D (`paper-12-holo-i3d.tex` in research repo).

## What ships in HoloScript

`@holoscript/comparative-benchmarks` exposes **`runPaper12PluginProbe()`**, which records:

| Bucket | Meaning |
|--------|---------|
| **Holo cold parse** | `parseHolo` on sources that differ by root name each iteration (no single stable cache key). |
| **Holo warm parse** | Same `.holo` snippet repeated — stabilizes toward steady-state parse cost. |
| **OpenUSD proxy LOC** | Non-empty line count on a minimal **static** `OPENUSD_EQUIVALENT_PROXY` stage string — replace with pxr export from the same scene graph for camera-ready tables. |
| **Plugin-init proxy** | One-shot microbench simulating heavy JSON/schema registration work (order-of-magnitude stub until Unity/OpenUSD hosts are scripted). |

## Commands

From repo root:

```bash
pnpm --filter @holoscript/comparative-benchmarks build
pnpm --filter @holoscript/comparative-benchmarks bench:paper12
```

CI-friendly / fast local (`PAPER12_QUICK=1`) is used by Vitest in this package.

## Implementation

- `packages/comparative-benchmarks/src/paper12PluginProbe.ts`
- CLI: `packages/comparative-benchmarks/src/paper12-cli.js` (after build) — also **`pnpm bench:paper12`** inside that package.

## External work (camera-ready)

Host-side **TTFF**, **RSS delta**, and **Unity + pxr** timings stay manual until automated loaders exist — paste into supplementary JSON or extend the probe with an optional `externalSamples` field when data is available.
