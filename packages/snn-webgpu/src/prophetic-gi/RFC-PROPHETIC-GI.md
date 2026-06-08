# RFC: Prophetic SNN-WebGPU Global Illumination

**Status**: Draft (Phase 2 foundation)
**Owner**: HoloScript Core team
**Tracks**: `task_1776361304039_txpy` — "Phase 2: Visual Parity (Prophetic SNN-WebGPU Global Illumination)"
**Last updated**: 2026-04-19

## Goal

Add a **prophetic** GI mode to `@holoscript/r3f-renderer`'s `GIRenderer`
that calculates context-aware indirect light bounces using the
`@holoscript/snn-webgpu` engine. The "prophetic" qualifier means each
SNN spike encodes a **predicted** radiance contribution for a probe
cell — the network is trained / configured so that high-firing-rate
neurons mark probes that _will_ receive significant indirect light next
frame, before any ray has been traced. This decouples GI cost from
geometric complexity (Lumen-style), but uses LIF dynamics rather than
SDF tracing.

The cost model targets:

- Client GPU work bounded by **N_probes** (constant), independent of
  scene polycount.
- Optional **HoloMesh remoting** so the SNN compute step can be
  off-loaded to a peer agent or central renderer (see
  `crdt://holomesh/feed/ttu` plumbing in sibling task
  `task_1776361304039_0v98`).

## Non-goals

- Replacing rasterisation or path tracing.
- Beating Lumen on photometric accuracy — only on cost predictability.
- Reproducing CryEngine SVOTI / Frostbite RTX-GI — those are separate
  tracks.
- Production-grade temporal stability (Phase 3).

## What ships in this RFC's first cut (foundation)

1. **`prophetic-gi/types.ts`** — public API contract: `ProphecyConfig`,
   `RadianceProbe`, `ProphecyFrame`, `ProphecyTransport`.
2. **`prophetic-gi/orchestrator.ts`** — `ProphecyOrchestrator` class
   wraps an existing `SNNNetwork` instance and exposes
   `step(sceneCtx) → ProphecyFrame`. The frame is a typed array of
   per-probe radiance proposals (RGB intensity + confidence).
3. **`shaders/prophetic-radiance.wgsl`** — WGSL kernel that consumes
   the SNN spike buffer + probe positions and produces a packed
   `RadianceProbe[]` buffer. Workgroup size 64. No texture sampling
   (geometry-agnostic — that's the point).
4. **`prophetic-gi/transport-local.ts`** — `LocalProphecyTransport`,
   the in-process implementation.
5. **`prophetic-gi/transport-holomesh.ts`** — `HoloMeshProphecyTransport`
   _interface scaffold only_. Calls a TODO-marked endpoint and falls
   back to local. Wiring lives in sibling task `_0v98`.
6. **`r3f-renderer` extension** — `GIRenderer` accepts
   `method: 'prophetic'` and a new `prophecy?: ProphecyConfig` prop.
   When set, it instantiates a transport and feeds the result into the
   SSGI ambient term as a per-probe colour.
7. **Tests** — type-level + shader-string compilation parity (the WGSL
   text must contain the bind-group declarations the orchestrator
   expects); transport handshake stub.

## What is **explicitly not** in this cut (reads the next agent should pick up)

- Real SNN training data for GI. The current cut uses the existing
  `LIFSimulator` configured with a synthetic input shaped to the probe
  count; producing actual spikes that correlate with visible GI takes
  a training pipeline (offline) — left as Phase 2.b.
- Real HoloMesh transport. The interface is defined; the websocket /
  CRDT feed lives in sibling task `_0v98`. Stub returns a structured
  `NotImplemented` so callers can wire it once the channel is open.
- Temporal reprojection / TAA-style accumulation across frames. The
  current frame is independent. Phase 3.
- Probe placement heuristics. Caller supplies probe positions;
  automatic placement is Phase 3.
- Benchmarking against Lumen / Babylon's `RadianceCascade`. Empirical
  numbers belong in Paper 13 (DumbGlass / SIGGRAPH track) not this
  RFC.

## Shape

```
                    ┌──────────────────────────┐
  scene context ──▶ │  ProphecyOrchestrator    │
  (probe positions, │  - drives SNNNetwork     │
   prev frame stats)│  - reads spike buffer    │
                    │  - dispatches WGSL pass  │
                    └────────────┬─────────────┘
                                 │ ProphecyFrame
                                 ▼
                    ┌──────────────────────────┐
                    │  ProphecyTransport       │
                    │  ├ LocalProphecy…  (now) │
                    │  └ HoloMeshProphecy (TBD)│
                    └────────────┬─────────────┘
                                 ▼
                    ┌──────────────────────────┐
                    │  GIRenderer              │
                    │  method = 'prophetic'    │
                    │  consumes RadianceProbe[]│
                    └──────────────────────────┘
```

## Open questions for the next agent

1. Probe layout: voxel grid vs. surface samples vs. screen-space
   reservoirs? RFC-HoloMap uses voxel — recommend matching for
   integration ease.
2. SNN training corpus: synthetic Cornell-box renders, or real-world
   HDR captures? Affects whether we need a separate training repo.
3. HoloMesh transport: best-effort UDP-style or guaranteed CRDT?
   Latency budget likely <16ms for 60Hz so probably the former.

## References

- `packages/r3f-renderer/src/components/GIRenderer.tsx` — existing GI
  implementation (SSGI / probes / ambient). This RFC adds a fourth
  method.
- `packages/snn-webgpu/src/snn-network.ts` — SNN orchestrator the
  prophetic pipeline drives.
- `packages/snn-webgpu/src/lif-simulator.ts` + `shaders/lif-neuron.wgsl`
  — neuron substrate.
- Sibling tasks (same Phase 2 cohort, created `1776361304039`):
  - `_zoje` — X402 paywall on TTU nodes.
  - `_0v98` — multi-agent CRDT feed at `crdt://holomesh/feed/ttu`.
- GOLD W.GOLD.001 — Architecture beats alignment. Keep this as
  composable layers, no domain leak into core.
