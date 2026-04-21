# RFC: HoloMap — native 3D reconstruction runtime

**Status:** Draft (Sprint 1 scaffold)
**Author:** HoloScript Core team
**Reviewers:** Joseph (founder approval gate), Copilot, Gemini
**Date:** 2026-04-18
**Related:** research/2026-04-18_lingbot-map-vs-holoscript*.md, `LINGBOT_FAMILY_LICENSE_AUDIT.md`, D.015 HoloX brand architecture, W.058 Babylon.js MCP threat, W.061 Trust by Construction, I.007 Lotus Genesis Trigger

## 1. Problem

lingbot-map (Ant Group) and the broader lingbot family own the "feed-forward RGB→3D foundation model" category today. Their runtime is PyTorch + CUDA, server-side only, non-deterministic, single-target, not agent-native, with no external provenance anchor. If HoloScript cedes this upstream half of the spatial pipeline — by plugging lingbot-map in as an external tool or by relying on Marble/Genie 3 manifests forever — every reconstruction API downstream tools learn is a competitor's API.

The Babylon.js 9.0 + MCP community server (W.058) is the real ship-clock. If Babylon elevates reconstruction to first-party MCP before HoloScript has a native answer, "agent-native 3D reconstruction in the browser" becomes Babylon's story permanently.

## 2. Goals

1. Ship a WebGPU feed-forward reconstruction runtime inside `@holoscript/core` within 60-90 days.
2. Emit `.holo` trait compositions directly (no Marble-manifest detour) so every existing compile target inherits reconstructions for free.
3. Deterministic replay under SimulationContract: same video hash + model hash + seed → byte-identical output.
4. Expose via MCP tools (`holo_reconstruct_from_video`, `_step`, `_anchor`, `_export`) so agents can compose reconstructions into workflows without Python glue.
5. Embed external provenance anchor (OpenTimestamps primary, Base calldata secondary per I.007) so every reconstruction breaks the Closed Terrarium Trap (W.065).

## 3. Non-goals (v1)

- **SOTA quality parity with lingbot-map at v1.** Browser-native + deterministic + multi-target + agent-native wins the positioning battle even at lower pixel quality. Quality follows in v2-v3.
- **Native robot control (lingbot-va equivalent).** VLA is a later HoloX instance — not this runtime. **Guardrail doc:** `docs/holomap/SCOPE_GUARDRAIL.md` (R7 — reject scope creep in reviews).
- **NeRF training.** HoloMap is feed-forward inference. Trainers are out of scope.
- **Mobile on-device path.** Phone capture uses existing `npu_depth` trait routing; HoloMap targets desktop/laptop WebGPU first.

## 4. Architecture

```
video/webcam frames ─► HoloMapRuntime (WebGPU transformer)
                       ├── PagedKVCache      (attention over 10k+ frames)
                       ├── TrajectoryMemory  (loop closure + drift correction)
                       └── AnchorContext     (coordinate-frame origin)
                              │
                              ▼
                       ReconstructionManifest
                       (+ .holo trait composition emitted via
                        HoloMapReconstructionTrait + 4 siblings)
                              │
           ┌──────────────────┼──────────────────┐
           ▼                  ▼                  ▼
       R3F viewer       Unity compiler      USD compiler    … 44+ targets
```

### 4.1 Runtime modules (scaffolded Sprint 1)

| Module | File | Sprint 1 state | Sprint 2 work |
|--------|------|----------------|---------------|
| HoloMapRuntime | `HoloMapRuntime.ts` | TS interfaces + deterministic `step/finalize` scaffold (CPU/WebGPU micro-encoder path, frame byte validation, dynamic bounds) | WGSL transformer pass, weight loader |
| PagedKVCache | `PagedKVCache.ts` | Page-table interface | GPU buffer mgmt, eviction policy |
| TrajectoryMemory | `TrajectoryMemory.ts` | Keyframe state shape | Ring buffer, loop-closure matcher |
| AnchorContext | `AnchorContext.ts` | State shape, policy config | Descriptor extraction, re-anchor logic |

### 4.2 Trait family (scaffolded Sprint 1)

| Trait | Binds to | Purpose |
|-------|----------|---------|
| `holomap_reconstruct` | Node (root of a session) | Declares a HoloMap reconstruction session |
| `holomap_camera_trajectory` | Node | Exposes per-frame pose stream as attribute |
| `holomap_anchor_context` | Node | Declares coordinate-frame anchor policy |
| `holomap_drift_correction` | Node | Declares drift-correction / loop-closure policy |
| `holomap_splat_output` | Node | Requests Gaussian splat output alongside point cloud |

**Why a new family and not an extension of `scene_reconstruction`:** The existing `SceneReconstructionTrait` (`scene_reconstruction`) is a **declarative route** to ARCore/RealityKit — the host platform performs the scan. HoloMap traits declare sessions against a **HoloScript-owned runtime** (WebGPU, deterministic). Collapsing them would conflate "who runs the scan" with "what kind of scan" and leak routing concerns into semantic traits.

### 4.3 MCP surface (Sprint 1 stubs, Sprint 2 impl)

- `holo_reconstruct_from_video(videoUrl, config)` — full-video reconstruction, returns manifest
- `holo_reconstruct_step(sessionId, frameBytes)` — streaming reconstruction, returns one step
- `holo_reconstruct_anchor(sessionId)` — returns current anchor context state
- `holo_reconstruct_export(sessionId, target)` — compiles the session's composition to a target

### 4.4 SimulationContract wiring

`HoloMapRuntime.replayHash()` returns `hash(videoHash || modelHash || seed)`. SimulationContract treats any two runs with the same replay hash as required-identical. Studio surfaces a "replay hash verified" badge; mismatches are blocking failures.

### 4.5 Provenance

`ReconstructionManifest.provenance.anchorHash` carries the external timestamp anchor. Default path per I.007: OpenTimestamps on the replay hash, Base calldata tx as secondary. Reconstructions that skip anchoring are flagged in Studio as "self-attested" — not blocked, but visibly lower trust tier.

## 5. Weight-acquisition strategy

Three candidate paths. Decision in Sprint 2 based on license audit + WGSL op parity. See **`LINGBOT_FAMILY_LICENSE_AUDIT.md`** for the internal risk register and counsel checklist (not legal advice).

1. **Distillation from lingbot outputs (bridge path).** Run public videos through lingbot-map, train a smaller WebGPU-friendly student. Fastest to parity. Licensing depends on Ant Group's terms — **gated** until counsel signs off per the audit doc.
2. **From-scratch on public data (clean path).** Train on permissively-licensed video + pose datasets (ScanNet, Matterport, etc.). Slower but unencumbered.
3. **Fine-tune an open base model (shortcut).** DepthAnything v2 / MiDaS have permissive licenses and ship production weights. Fine-tune for our coordinate-frame + trajectory output shape. Shortest time-to-demo.

Recommendation: run path 3 for the demo, path 2 in parallel for the production weights. Path 1 only if licensing clears cleanly.

### 5.1 Weight distribution (runtime)

**Decision (2026-04-19):** Ship weights as **content-addressed blobs**, not embedded inside `.holo` compositions.

| Mode | When | Behavior |
|------|------|----------|
| **Default (production)** | Studio, MCP, HoloLand desktop | `HoloMapConfig` carries **`weightCid`** (multihash / CID) plus optional **`weightUrl`** (HTTPS CDN or gateway). Runtime **fetches once**, verifies hash against `weightCid`, then caches in **IndexedDB** (browser) or temp dir (Node). Replay fingerprint already keys on `weightCid` + `modelHash` — mismatched bytes fail closed. |
| **Bundled / offline** | CI golden tests, air-gapped demos | Same tensors shipped as **versioned assets** under `packages/core/src/reconstruction/__fixtures__/weights/` (or package `dist`); loader accepts **`weightCid`** with **local `file://` or package-relative path** in `weightUrl`. Documented exception only — not the default for consumer builds. |
| **HoloLand / XR consumer** | Quest, phone-as-bridge | **Pointer-only in session:** app ships **no** large weights in the APK; session manifest lists `weightCid` + signed URL or mesh-local cache handle. Aligns with U.001 (no developer toolchain in the user loop). |

**Rationale:** Keeps compositions small, preserves provenance (CID is the contract), and matches SimulationContract replay identity. Studio surfaces fetch + verify progress; failed verify is a blocking error before inference starts.

## 6. Minimum viable quality bar (acceptance)

- **Acceptance video:** indoor room, ~2000 frames, handheld walkthrough.
- **SLOs:** p50 reconstruction latency < 15s, p99 < 45s per 2k-frame video. Browser tab stays responsive (< 100ms main-thread stalls).
- **Quality:** trajectory closes loops within 0.5m of ground truth; point cloud recognizable as the source room (human-legible, not "SOTA").
- **Determinism:** two runs with same config produce byte-identical manifests.
- **Compile check:** emitted composition compiles cleanly to R3F, Unity, Godot, USD targets with no manual editing.

## 7. Open questions

- **Q1 (blocking Sprint 2):** Integration sequencing for already-shipped P0 kernels (attention/GEMM/norm/softmax/RoPE/patch embed): what is the smallest end-to-end pass through `HoloMapRuntime.step()` that yields a reproducible acceptance-video manifest?
- **Q2:** Do we need per-vertical fine-tunes (indoor / outdoor / object scan)? Trait-composition makes variants natural but splits training work. **Decision (2026-04-21):** ship **generalist** weights for v1.0; add **optional specialist** `weightCid`s in v1.1+ with explicit vertical naming and replay identity — see `docs/holomap/VERTICAL_WEIGHT_VARIANTS.md`.
- **Q3:** Where does HoloMap sit in `packages/`? Currently `packages/core/src/reconstruction/`. Alternative: `packages/reconstruction-runtime/` as its own workspace. Keep in core for Sprint 1 to minimize build graph changes; revisit if bundle size becomes an issue.
- **Q4:** Do we share weights with HoloLand's mobile `npu_depth` path, or keep HoloMap desktop-only and NPU mobile-only? **Decision (2026-04-19):** keep **separate** weight families for v1 — see `docs/holomap/MODALITY_WEIGHTS.md`. `ModalitySelector` picks per surface without implying identical checkpoints.

## 8. Ship plan

- **Sprint 1 (this sprint, 2w):** RFC + scaffold + trait stubs + MCP stubs + WGSL gap analysis.
- **Sprint 2 (2w):** **Integrate** shipped P0 WGSL kernels into `HoloMapRuntime` (real forward pass; see `WGSL_GAPS.md` ✅ rows), KV cache wiring, weight loader + demo weights (paths 2/3 per §5), `holo_reconstruct_from_video` end-to-end on acceptance video. Shader authoring is no longer the gating item for P0 ops listed there.
- **Sprint 3 (2w):** HoloLand "scan your room in 90s, walk it in VR" demo, SimulationContract replay wiring, provenance anchoring, Studio `ReconstructionPanel.tsx`.

### 8.1 Sprint accounting correction (2026-04-19)

Implementation started earlier than the original Sprint-1 wording implied. The following should be counted as **pulled-forward Sprint-2 work** already in progress/landed:

- core runtime/operator files under `packages/core/src/reconstruction/` (kernel + runtime wiring surface),
- trait-family registration and parser/type plumbing,
- MCP-side reconstruction route groundwork in `packages/mcp-server/src/`.

Planning/burndown should therefore track Sprint-1 completion against **RFC/scaffold/governance gates**, while reporting these implementation items against Sprint-2 capacity to avoid hidden overrun.

### 8.2 PR hygiene rules (required while repo churn is high)

1. One objective per PR: `docs/rfc`, `core-scaffold`, `traits`, `mcp-stubs`, `bench/artifacts`.
2. Keep PRs small and path-scoped; avoid mixing docs, runtime code, and bench artifacts.
3. Stage explicit file lists only; no bulk staging patterns.
4. Every PR description must include: changed paths, tests run, and which sprint backlog item it burns.
5. If a change crosses packages (`core` + `mcp-server` + `studio`), split into stacked PRs unless the contract would be broken otherwise.

## 9. Risks

- **WGSL op gaps block implementation** — mitigated by Sprint 1 gap analysis (`WGSL_GAPS.md`).
- **Babylon.js MCP ships reconstruction first** — weekly commit-log watcher; pivot to differentiated framing if they land first.
- **License audit blocks distillation path** — two fallbacks (from-scratch, fine-tune) available.
- **Quality gap feeds "HoloMap is toy" perception** — mitigated by transparent benchmarks and positioning (browser-native + deterministic, not "SOTA").

## 10. Hygiene tracking updates

- **2026-04-19 / Hygiene A**: core plumbing commit isolation completed (`types/parser/traits` path-scoped commit).
- **2026-04-19 / Hygiene B**: runtime + docs deltas updated for deterministic scaffold behavior:
       - input frame byte-length guard in `step()`
       - computed bounds from emitted points in `finalize()`
       - explicit self-attested provenance placeholder (`anchorHash`) pending external anchoring path
