# SNN depth distillation feasibility + CRDT depth-map merge strategies

**Board:** `task_1776640942396_9r2u` (follow-up from 2d→3d hologram media pipeline research).  
**Date:** 2026-04-21  
**Scope:** Feasibility and architecture choices only — no product code in this cycle.

## Problem framing

Two coupled questions from the media pipeline thread:

1. **Depth distillation from SNNs** — Can spike-based encoders/decoders or intermediate population codes produce **stable, low-latency depth or disparity-like signals** suitable for hologram/LOD decisions (without replacing classical stereo/ML depth entirely)?
2. **CRDT merge for depth maps** — When multiple agents or devices contribute **per-view depth or heightfield tiles**, how should HoloScript merge them under delay and conflict without shipping full raster buffers every frame through a CRDT?

## 1. SNN depth distillation — feasibility sketch

### What already exists in-repo

- `@holoscript/snn-webgpu` provides **LIF** simulation, **Poisson / rate encoders**, and **spike-count (and related) decoders** over fixed windows. That stack is a realistic place to prototype **temporal integration** of depth cues (motion parallax, focus/defocus proxies encoded as spike rates) into a **low-dimensional control signal**, not a dense depth image.

### Distillation options (ordered by implementation cost)

| Approach | Idea | Pros | Cons |
|----------|------|------|------|
| **A. Decoder head on spike statistics** | Pool firing rates per region → small MLP or linear map → scalar/vector **depth prior** per tile | Uses existing encoder/SNN path; bounded output | Needs labeled or self-supervised targets; risk of jitter at 60fps |
| **B. Teacher–student (ANN→SNN)** | Train thin ANN depth stub on RGB-D; distill to SNN with spike-aware loss | Stronger accuracy if teacher is good | Heavy offline pipeline; may defeat “neuromorphic efficiency” story unless student is tiny |
| **C. Event-style input** | Feed asynchronous events from silicon / simulated event camera into SNN | Matches neuromorphic hardware narrative | HoloScript path today is frame-centric WebGPU LIF — gap to close |

### Feasibility verdict (this cycle)

- **Prototype-ready:** Approach **A** inside existing WebGPU SNN is **feasible** for **coarse** depth or confidence (e.g. per-tile scalar + variance), not dense ADE-quality maps.
- **Not yet specified:** Ground-truth strategy (simulated stereo vs. recorded RGB-D vs. weak supervision from renderer z-buffer in digital twin).

**Recommendation:** Treat SNN depth as a **gating / attention signal** for which volumetric or Gaussian splat LOD to refine, classical depth as **authoritative geometry** until proven otherwise.

## 2. CRDT depth-map merge — strategies

### Constraint from HoloScript architecture

`docs/planning/GAPS_3-21-2026-research/2026-03-21_holoscript-gaps-feature-roadmap-EVOLVED.md` already states: **CRDTs should not sync 60fps particle buffers**. The same applies to **full-resolution depth streams**. CRDTs should carry **slowly changing or authoritative metadata**; fast geometry uses **binary channels** or local prediction.

### Mergeable representations

| Representation | CRDT-friendly? | Merge rule sketch |
|----------------|----------------|-------------------|
| **Global heightfield / DEM** (low res, chunked) | Yes | Per-chunk **LWW** with **vector clock + author DID**; optional merge of `confidence` scalar |
| **Sparse landmarks** (planes, keypoints) | Yes | OR-Set / map of ids → LWW registers for parameters |
| **Dense per-frame depth** | No (for CRDT payload) | Sync **params** (camera pose, intrinsics) via `crdt-spatial`; ship depth over **WebRTC datagram** or **regional blob store** |

### Tie-in to `@holoscript/crdt-spatial`

Spatial CRDT already uses **LWW for position/scale** and a **hybrid rotation** strategy. **Depth tile ownership** can follow the same pattern: each tile id is a register; writers bump version + confidence; readers blend only **adjacent consistent** tiles (application-level).

### Open merge hazards

- **Scale ambiguity:** Different devices use different depth units or confidence — need a **normalized schema** (meters, log-depth, or quantized uint16 with shared scale).
- **Temporal coherence:** Merging maps from different timestamps without pose alignment produces ghosts — require **pose stamped** with the same frame graph used for hologram composition.

## 3. Suggested next experiments (engineering)

1. **SNN:** Add a benchmark harness: RGB tiles → encoder → small 2-layer SNN → decoded **two outputs** (depth bias + uncertainty) vs. stub teacher — measure latency and stability on WebGPU.
2. **CRDT:** Prototype **chunked heightfield** (e.g. 64×64 tiles) in a dev scene: two peers edit disjoint chunks; verify LWW + tombstones behave under out-of-order delivery.
3. **Pipeline:** Document explicit **split**: CRDT = tile metadata + ownership; **data plane** = depth blobs or mesh deltas.

## References (in-repo)

- `packages/snn-webgpu/README.md` — LIF, encoders, decoders.
- `packages/crdt-spatial/README.md` — Loro, LWW, hybrid rotation.
- `docs/planning/GAPS_3-21-2026-research/2026-03-21_holoscript-gaps-feature-roadmap-EVOLVED.md` — CRDT scope for fast vs slow state.
