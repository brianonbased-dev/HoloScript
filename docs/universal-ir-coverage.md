# HoloScript as a Universal IR for Spatial Computing — Coverage Matrix

**Status:** Draft v1.1 — 2026-04-23 (Wave B Stream 3, per `research/2026-04-21_multi-mode-plan.md`). Plugin stub manifest added in §2.1.
**Audience:** External integrators, pipeline architects, founding-team sales.
**Claim:** HoloScript is not a new asset format. It is an **intermediate representation** that sits **above** geometry standards (glTF, USD, FBX, VRM) and **beside** generative tools (URDFormer, Scenethesis, Marble, Genie 3), describing **semantics, behavior, and multi-target compilation** in a form that survives the trip across engines (Unity, Unreal, R3F, Godot, WebGPU, WebXR).

## 1. Why this matrix exists

Every week a new 3D tool, world model, or avatar standard ships. Integrators ask the same question — "does HoloScript support X?" — and the answer is almost always: "HoloScript sits at a different layer; here's how the bridge works." This doc consolidates the bridges that already have written research backing.

Each row summarises a single memo from `research/` or `memory/`. The matrix is **honest** — "Status" distinguishes what's implemented (anchor code shipped), what's documented-but-unbuilt, and what's hard-blocked on external factors (vendor ToS, licensing, hardware).

## 2. Coverage matrix

| Tool / standard | Direction | Status | Integration pattern | Product gap | Memo |
|---|---|---|---|---|---|
| **glTF 2.0** | In + Out | ✅ Native | `HumanoidLoader`, `ModelImporter`, Studio capabilities API export | None (core format) | `research-avatar-interop-vrm-gltf-2026-04-22.md` |
| **VRM 1.0** | In + Out | ✅ Native (subset) + 🟡 Stub | `packages/core/src/assets/HumanoidLoader.ts` — bone/expression unions aligned to VRM 1.0 · Stub: `@holoscript/vrm-avatar-plugin` | Explicit matrix of which VRMC_* extensions honored per compiler target (Unity/Unreal/WebGPU) still needs golden file | `research-avatar-interop-vrm-gltf-2026-04-22.md` |
| **OpenUSD** | Out (interchange) | 🟡 Adapter + 🟡 Stub | HoloScript → structured scene + rig + physics hints; Python USD APIs / Omniverse Connectors turn into prims/layers · Stub: `@holoscript/openusd-plugin` | HoloScript is not USD native; positioning: "HoloScript **exports** to USD when a studio pipeline requires it" | `2026-04-23_openusd-holoscript-robotics-frontend.md` |
| **URDF / URDFormer** | In (bridge) | 🟡 Adapter + 🟡 Stub | Image → URDFormer → URDF + meshes → converter script → `.holo` or ECS snapshot with validation · Stub: `@holoscript/urdformer-plugin` | URDFormer output treated as **draft** — sanitization, scale calibration, asset binding before shipping | `2026-04-22_urdformer-urdf-holoscript-bridge.md` |
| **FBX / OBJ (via Assimp)** | In | 🟡 Pipeline + 🟡 Stub | Server-side Assimp CLI/microservice OR WASM in browser → glTF → ModelImporter · Stub: `@holoscript/assimp-plugin` | Choose server (full feature coverage) vs WASM (no round-trip) per product — both documented | `2026-04-21_assimp-fbx-obj-gltf-pipeline.md` |
| **Mixamo** | In (human-in-loop) | 🔴 Manual only + 🟡 Stub | Artist uploads on mixamo.com → downloads FBX → Assimp path → ModelImporter · Stub: `@holoscript/mixamo-plugin` (read-only metadata) | No vendor API; automating the website violates ToS. Document manual step in onboarding. | `2026-04-21_mixamo-programmatic-upload.md` |
| **Niantic LGM** | In (data pipeline) | 🟡 Trait exists, data layer TBD + 🟡 Stub | `@geospatial_anchor` + `packages/plugins/geolocation-gis-plugin/` ingest mesh/bounds as `@digital_twin` layers · Stub: `@holoscript/niantic-lgm-plugin` | Licensed data access + semantic world-model ingestion still connector work, not vendored in-repo | `research-niantic-lgm-geospatial-traits-2026-04-22.md` |
| **NodeToy (shader graph)** | In (lossy) | 🟡 Subset + 🟡 Stub | Phase 1: 30-50 nodes covering ~90% PBR/UV/triplanar/common math; raw GLSL/WGSL escape hatch for custom expression · Stub: `@holoscript/nodetoy-plugin` | 1:1 clone of 150+ nodes is high maintenance — prefer constrained core + NodeToy JSON import with flagged unsupported ops | `2026-04-24_nodetoy-nodes-holoscript-shader-trait-map.md` |
| **World Labs Marble** | Out (dataset) | 🟡 Roadmap + 🟡 Stub | HoloScript → glTF/USD + `dataset_manifest` sidecar (seed, version, camera paths) for synthetic data · Stub: `@holoscript/marble-genie3-plugin` (T1 neural asset, gated by paper-13) | Needs batch rendering + ground-truth export; formal partnership required before marketing "training format for" | `2026-04-24_world-labs-marble-genie3-holoscript-world-models.md` |
| **DeepMind Genie 3** | Out (dataset, prototype) | 🟡 Roadmap + 🟡 Stub | Same structured-priors path as Marble; world-model pipelines want pixels + state, not raw `.holo` · Stub: `@holoscript/marble-genie3-plugin` (shared) | On-device ingestion requires conversion + validation; no raw `.holo` guarantee | (same) |
| **MSF (Metaverse Standards Forum)** | Positioning | 🟢 Participate-as-stakeholder + 🟡 Stub | HoloScript references URIs to glTF/USD assets + portable metadata (entity IDs, behavior traits, network roles) as semantic layer above format · Stub: `@holoscript/msf-3d-plugin` | "We are a standard" is a process + adoption outcome, not a press release | `2026-04-23_msf-3d-asset-interop-semantic-annotation.md` |
| **Scenethesis / SceneCraft** | In (inspiration / ingestion) | 🟡 Ingestion + 🟡 Stub | End-to-end generative scenes (LLM + vision) → structured ingestion step into `.holo` trait composition · Stub: `@holoscript/scenethesis-plugin` | HoloScript's axis is constraints-first + deterministic compilation, NOT agentic generation — these are ingestion sources, not architecture equivalents | `2026-04-22_scenethesis-scenecraft-holoscript-comparison.md` |
| **Remotion (video)** | Out (batch) | ✅ Native + 🟡 Stub | `packages/video-tutorials` uses `remotion`, `@remotion/cli`, `@remotion/renderer` directly. `@remotion/three` wraps R3F Canvas for frame-locked rendering · Stub: `@holoscript/remotion-r3f-plugin` (live-capture binding) | Live R3F loop ≠ Remotion composition — choose pattern per use case (Remotion-native 3D vs live-capture) | `2026-04-21_remotion-r3f-live-capture-patterns.md` |
| **TalkingHead + WebXR** | Out (runtime) | 🟡 Benchmark-gated + 🟡 Stub | Target: lip-sync + spatial audio @ 90fps in VR. Measured via test matrix (head-only / head+8-sources / head+reverb+anim) · Stub: `@holoscript/talkinghead-plugin` (viseme→`@lipsync` trait) | No measured numbers yet — benchmark methodology documented, run is pending | `2026-04-25_talkinghead-webxr-benchmark-methodology.md` |
| **Web-surface embed (iframe)** | In (composition) | 🟡 Stub | Embed HTML iframe content as `@web_surface` trait for composition into spatial scenes · Stub: `@holoscript/web-preview-plugin` | Security sandbox, CSP, and cross-origin policies per target compiler; not yet wired to Studio preview | (new) |

**Legend**: ✅ native / shipped · 🟢 participation / positioning · 🟡 adapter needed, roadmap, or stub package · 🔴 hard-blocked on external factor.

**"Stub package"** = a minimal interop surface (`src/index.ts` + tests) that declares the mapping API and compiler/trait targets. Stubs are **intentionally thin** — they define the contract and fail loudly on unimplemented paths. Framework-specific bindings are the next shipping slice.

## 2.1. Stub package manifest (2026-04-23)

Thirteen interop stubs shipped under `packages/plugins/` on 2026-04-23 (Wave B Stream 3). Each has a `package.json`, `src/index.ts` mapping function, `__tests__/index.test.ts`, `vitest.config.ts`, and `tsconfig.json`. Tests: 42 passing across all 13 stubs.

| Package | Maps | Targets | Test count |
|---|---|---|---|
| `@holoscript/openusd-plugin` | `.holo` ↔ USDA/USDC prims | paper-12 OpenUSD proxy replacement | 3 |
| `@holoscript/urdformer-plugin` | URDF → `.holo` composition traits | robotics column of Universal-IR | 3 |
| `@holoscript/scenethesis-plugin` | Scenethesis scene graphs → `.holo` primitives | world-synthesis column | 3 |
| `@holoscript/niantic-lgm-plugin` | VPS anchors / LGM tiles → `@geospatial` traits | geospatial column | 3 |
| `@holoscript/msf-3d-plugin` | Semantic-annotated 3D assets → `.holo` traits | standards column | 3 |
| `@holoscript/marble-genie3-plugin` | Latent world-model outputs → `.holo` traits (tier `T1`, linked to paper-13 contract) | dataset / world-model column | 4 |
| `@holoscript/nodetoy-plugin` | NodeToy graphs → `@shader` material traits | shader column | 3 |
| `@holoscript/remotion-r3f-plugin` | Remotion compositions + R3F capture → `.holo` cinematic traits | video / live-capture column | 3 |
| `@holoscript/vrm-avatar-plugin` | VRM 1.0 bones + expressions → `@avatar` traits | avatar column | 3 |
| `@holoscript/mixamo-plugin` | Mixamo clip metadata → `@anim_clip` traits (read-only, no public upload API) | animation-library column | 3 |
| `@holoscript/assimp-plugin` | FBX/OBJ/glTF scene tree → `.holo` primitives | import-pipeline column | 3 |
| `@holoscript/talkinghead-plugin` | Viseme-driven facial animation → `@lipsync` traits | avatar + XR column | 3 |
| `@holoscript/web-preview-plugin` | HTML iframe → `@web_surface` composition trait | composition column | 5 |

**Next shipping slice per stub**: framework adapter (e.g. real USD Python bindings for openusd-plugin, real Assimp WASM wiring for assimp-plugin, actual viseme→bone weighting for talkinghead-plugin). Stubs deliberately stop at the mapping surface so compiler/trait contracts can be written against them while bindings land incrementally.

## 3. The shape of the IR

HoloScript's value **in this matrix** is the layer above:

```
                 [ Generative tools: Scenethesis, SceneCraft, Marble, Genie 3 ]
                 [ Perception/reconstruction: URDFormer, LGM, depth models ]
                                       │
                                       ▼  (structured ingestion)
     Assets  ─────────────▶   HoloScript  ◀───────────── Avatars
     (glTF, USD, FBX, OBJ)    .holo + traits                 (VRM, glTF)
          ▲                       │    ▲
          │                       │    │  (behavior, network, rules)
          │                       │    │
   Assimp (FBX→glTF)              ▼    │
   NodeToy (shader graph)  ──▶  Compilers  ────▶  Unity, Unreal, R3F, WebGPU,
                                              Godot, WebXR, Remotion, USD export
```

- **Above assets**: HoloScript describes *semantics* glTF/USD cannot carry (network roles, interaction rules, behavior trees, multi-target invariants).
- **Beside generators**: HoloScript ingests outputs from URDFormer / LGM / Scenethesis as **draft scene graphs** — with validation, scale calibration, and sanitization before anything ships.
- **Below runtimes**: The compiler family (Unity / Unreal / R3F / WebGPU / Godot / glTF / USD / Remotion) is the fan-out. Adding a runtime means another compiler, not another data format.

## 4. What HoloScript deliberately is NOT

- **Not a replacement** for glTF, USD, FBX, VRM. These carry geometry and material truth. HoloScript references them by URI and adds semantics.
- **Not an agentic scene generator**. Scenethesis and Marble are. HoloScript accepts their output.
- **Not a DCC tool**. Blender / Maya / Houdini stay. HoloScript talks to them via export paths.
- **Not a proprietary format**. The `.holo` file is a structured, compiler-checkable description — portable by design, committed to git, reviewable by humans.

## 5. Honest gaps (what "adapter needed" really means)

These are shipping today as **connector code, written on demand**, not vendored core:

- **Niantic LGM semantic mesh ingest** — needs licensed data + a tile adapter.
- **OpenUSD export** — currently structured-scene → Python USD APIs; no direct `.holo → .usd` compiler.
- **URDFormer pipeline** — requires GPU/edge decision + latency budget before real-time Studio integration.
- **NodeToy interchange** — lossy lift with flagged unsupported ops; raw GLSL/WGSL escape hatch.
- **Marble / Genie 3 data pipeline** — batch rendering + ground-truth export + `dataset_manifest` sidecar still WIP.

Each one is a well-scoped connector, not a language-level rewrite. That is the design intent of putting semantics at the IR layer.

## 6. Pointers for integrators

**If you have assets:** Assimp memo (FBX/OBJ → glTF) + VRM/glTF memo (avatar interop).
**If you have a world model:** Marble/Genie 3 memo (dataset shape) + MSF memo (standards positioning).
**If you have geospatial data:** Niantic LGM memo + `packages/plugins/geolocation-gis-plugin/`.
**If you are building a shader editor:** NodeToy memo (constrained subset strategy).
**If you are rendering video:** Remotion memo (batch vs live patterns).
**If you need URDF → web:** URDFormer memo + OpenUSD memo.

## 7. Maintenance

This matrix is generated by consolidating memos under `research/` and `memory/`. Adding a new tool:

1. Write the research memo (scope, vendor narrative with real URLs, HoloScript anchor code or gap, positioning).
2. Add a row to section §2.
3. Update §5 if the memo surfaces a new honest gap.
4. If the tool needs a stub package, scaffold `packages/plugins/<name>-plugin/` with the same shape as the 13 stubs in §2.1 and add a row to the manifest.

Do **not** pin tool versions or feature matrices from external vendors without dating the claim and citing the source URL. Vendor capabilities and access change faster than this doc ships.

## References (internal)

Memos consolidated in this matrix (all under `C:\Users\Josep\Documents\GitHub\HoloScript\`):

- `research/2026-04-22_urdformer-urdf-holoscript-bridge.md`
- `research/2026-04-23_openusd-holoscript-robotics-frontend.md`
- `memory/research-avatar-interop-vrm-gltf-2026-04-22.md`
- `memory/research-niantic-lgm-geospatial-traits-2026-04-22.md`
- `research/2026-04-21_assimp-fbx-obj-gltf-pipeline.md`
- `research/2026-04-21_mixamo-programmatic-upload.md`
- `research/2026-04-24_nodetoy-nodes-holoscript-shader-trait-map.md`
- `research/2026-04-24_world-labs-marble-genie3-holoscript-world-models.md`
- `research/2026-04-23_msf-3d-asset-interop-semantic-annotation.md`
- `research/2026-04-22_scenethesis-scenecraft-holoscript-comparison.md`
- `research/2026-04-21_remotion-r3f-live-capture-patterns.md`
- `research/2026-04-25_talkinghead-webxr-benchmark-methodology.md`
- `memory/paper-12-plugin-openusd-probe.md`
- `memory/talkinghead-webxr-benchmark-protocol-2026-04-22.md`

Multi-mode plan tracker: `C:\Users\Josep\.ai-ecosystem\research\2026-04-21_multi-mode-plan.md` §2 Stream 3.
