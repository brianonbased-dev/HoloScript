# HoloMap vertical weight variants (RFC §7 Q2)

**Status:** Post-launch planning (aligned with board: base checkpoint first, variants in v1.1+)  
**Date:** 2026-04-21  
**Related:** [RFC-HoloMap.md](../../packages/core/src/reconstruction/RFC-HoloMap.md) §7 Q2, [MODALITY_WEIGHTS.md](./MODALITY_WEIGHTS.md) (desktop vs mobile families)

## 1. Question (Q2)

Do we ship **per-vertical fine-tunes** (indoor / outdoor / object-centric capture) in addition to a **generalist** HoloMap checkpoint?

## 2. Decision

| Phase | Checkpoint strategy | Rationale |
|-------|---------------------|-----------|
| **v1.0** | **One generalist** WebGPU weight family (`weightCid`) tuned on mixed indoor + outdoor + object clips | Minimizes training surface, release risk, and CDN cardinality; matches Sprint 2–3 acceptance (single acceptance video bar). |
| **v1.1+** | **Optional vertical specialists** — up to three extra blobs: **indoor**, **outdoor**, **object** | Quality win when capture domain is known; trait/composition can select variant without forking the protocol. |

**Training cost tradeoff (planning numbers, not commitments):** each extra variant is roughly a **full fine-tune cycle** (data curation + eval + CID publish) on top of the teacher/generalist. Expect **~3×** training/QA work for three specialists vs one generalist; expect **per-domain error** to drop only when eval sets are **stratified** by vertical (otherwise gains look like noise).

## 3. Vertical definitions (for data and naming)

| Variant | Typical capture | Failure modes generalist may show | Weighting / data emphasis |
|---------|-----------------|-----------------------------------|---------------------------|
| **Indoor** | Rooms, offices, warehouses | Textureless walls, repeated features, SLAM drift in long corridors | Short baseline, loop closures, normal-bounded depth |
| **Outdoor** | Streets, campuses, facades | Scale ambiguity, lighting extremes, dynamic occluders | Exposure-invariant aug, longer baselines, geo-weak priors |
| **Object** | Tabletop / close-range orbit | Missing context, wrong global scale, border artifacts | Tight frustum, high parallax, background masking |

**Object** here means **scene-scale reconstruction dominated by a single object** (scan-style), not mesh authoring of CAD parts.

## 4. Runtime contract (composition + config)

- **Content address:** Each variant is a **distinct** `weightCid` (and optional `weightUrl`). No implicit “same bytes, different mode.”
- **Selection:** Product layer chooses `weightCid` (and may set `verticalProfile` on `HoloMapConfig` for **replay identity** — see below).
- **`verticalProfile` field:** Optional `HoloMapConfig.verticalProfile` in `HoloMapRuntime`: `'generalist' | 'indoor' | 'outdoor' | 'object'`.  
  - Omitted or `'generalist'` does **not** change the replay fingerprint (backward compatible).  
  - `'indoor' | 'outdoor' | 'object'` is included in `computeHoloMapReplayFingerprint` so SimulationContract replay distinguishes specialist runs even if callers mistakenly reuse the same `weightCid`.

## 5. Trait compositions (automatic variant selection)

Post-launch, traits or scene metadata can **hint** a vertical (e.g. environment tags, capture rig id). The resolver maps hint → **published `weightCid`** for that vertical. Until specialist CIDs ship, hints should **fall back to generalist** without error.

## 6. Open follow-ups

- Publish a **versioned manifest table** (generalist + specialists) in ops docs when first specialist CID lands.
- Add **stratified benchmarks** per vertical before claiming SLO improvements.
- Revisit **merging** specialists into a mixture-of-experts router (single graph, multiple heads) only if CDN/download size becomes the bottleneck.
