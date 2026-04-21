# Paper-12 — Plugin-loaded overhead + OpenUSD LOC (in-repo probe)

**Paper:** HoloLand I3D (`paper-12-holo-i3d.tex` TeX `\\todo{}` at ~518, 522).

This file records a **timed run** of `runPaper12PluginProbe()` on a single host so the paper can cite **in-repo** cold/warm parse means and LOC proxy counts (not hand-wavy external estimates).

## Reproduce

```bash
pnpm --filter @holoscript/comparative-benchmarks build
cd packages/comparative-benchmarks
pnpm run bench:paper12
```

Omit `PAPER12_QUICK` for the default (200 iter / 150 ms budget per tinybench task). Set `PAPER12_QUICK=1` for CI / fast local.

**Implementation:** `packages/comparative-benchmarks/src/paper12PluginProbe.ts`  
**Narrative:** `memory/paper-12-plugin-openusd-probe.md`

## Captured run

| Field | Value |
|-------|--------|
| **Host OS** | win32 x64 |
| **Node** | v22.22.0 |
| **Probe** | `@holoscript/comparative-benchmarks` `runPaper12PluginProbe()` default (not quick) |

### Summary (mean `parseHolo` times, same scene family)

| Metric | Value |
|--------|--------|
| **Holo cold parse** (unique root per iter) | 0.0463 ms mean |
| **Holo warm parse** (fixed source) | 0.0210 ms mean |
| **warm / cold ratio** | ~0.45 (warm cheaper than cold on this run) |
| **Holo scene non-empty lines** (warm snippet) | 6 |
| **approx trait-shard lines** (4 traits × 3) | 12 |
| **OpenUSD proxy stage non-empty lines** | 18 |
| **Plugin-init proxy** (JSON churn stub, one-shot ms) | ~2.26 ms |

### Full JSON (2026-04-21 local capture)

```json
{
  "paperId": "paper-12",
  "generatedAt": "2026-04-21T21:29:25.386Z",
  "holo": {
    "sourceLines": 6,
    "approxTraitShardLines": 12,
    "coldParseMeanMs": 0.04634587581091471,
    "warmParseMeanMs": 0.021034730790817937,
    "warmVsColdMeanRatio": 0.45386413403075965
  },
  "openUsdEquivalent": {
    "schemaAndPayloadLines": 18,
    "pluginInitProxyMs": 2.2581000000027416
  },
  "notes": [
    "Cold path varies the root identifier so the parser cannot reuse a single memoized key; warm path repeats identical source.",
    "OpenUSD line count is a static proxy stage — swap for pxr usdc/usda export from the same graph for camera-ready numbers.",
    "TTFF and RSS deltas vs Unity require host measurements; paste into JSON `externalSamples` when available."
  ]
}
```

**Provenance:** A matching file is also written under `packages/comparative-benchmarks/results/` on each `bench:paper12` run (filename includes ISO timestamp).

## Still external (per probe `notes`)

- Unity / editor **TTFF** and **RSS** deltas vs the same scene family.
- **pxr** export line counts on pinned **OpenUSD** release tags (replace the static `OPENUSD_EQUIVALENT_PROXY` string when scripted).
