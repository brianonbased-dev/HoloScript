# Native HoloScript Runtime: Trait-Parity Backlog & `.tsx` Codegen Deprecation

**Date:** 2026-06-15
**Author:** Claude (claude-opus, branch `claude/hololand-holoscript-aaa-mmo-rbhty7`)
**Scope:** HoloLand + HoloScript readiness for a native AAA MMO; the `.holo → .tsx` (R3F)
codegen path as an agent-poisoning redundancy; the trait-runtime parity backlog that must be
closed before the codegen path can be retired.
**Status:** Research / decision input. Not a shipped change — this is the durable record behind
the board tasks that follow from it.

---

## 1. Executive Summary

Two findings, one conclusion.

1. **AAA MMO readiness ≈ 4/10.** HoloLand + HoloScript is a genuine, well-engineered VR
   *creation platform* with a real language runtime, but it is far from a AAA MMO. The dominant
   pattern across every pillar is a gap between what the roadmaps claim ("Phase 2 complete, 681
   multiplayer tests") and what is actually wired and deployed. "AAA" (fidelity) and "MMO"
   (server-authoritative scale) are the two specific axes where it is weakest.

2. **The `.holo → .tsx` (R3F) compiler is redundant *and* poison.** It is a second
   implementation of "interpret a composition into a renderable scene" (the first being the
   native runtime executor), and — because no agent family is trained on HoloScript — it is an
   *escape hatch* that pulls agents out of the native substrate and into TypeScript/React, where
   they then debug and maintain the generated `.tsx`. The native-HoloScript-on-mobile/web/VR goal
   requires a single data-driven runtime path; the `.tsx` codegen path actively works against it.

**Conclusion / sequencing:** *Complete the native runtime, then delete the `.tsx` codegen.* The
work is one backlog viewed from two angles — closing the ~50 behavioral/render trait handlers
the native runtime is missing **is** the work that makes the R3F compiler safe to retire. Deleting
the compiler before parity breaks the render surface; closing parity first lets the compiler
delete itself.

---

## 2. AAA MMO Readiness Scorecard

Evidence gathered by direct source reading across `/HoloScript` and `/Hololand` (the live MCP
endpoint `mcp.holoscript.net` was unreachable from the research sandbox — likely network policy
— so all findings are from source, not live tools).

| Pillar | Score | Verdict |
|---|---|---|
| Language runtime / engine | 4/10 | Parser, game loop, physics, event system are REAL; ~80–93% of traits are *declarations* not behavior; no pathfinding; no MMO-scale instancing in the loop |
| Networking / multiplayer | 5/10 | Real delta-compressed state sync + WS/WebRTC transports; **no server authority**, interest-management exists-but-never-called, voice not networked, zero load testing |
| Rendering / client | 3.5/10 | Solid Three.js/R3F + WebXR web client w/ production VR frame-budget system; browser-WebGL with a **12–20× polygon gap vs. AAA**, no ray tracing/GI, manual asset pipeline |
| Backend / persistence / scale | 3/10 | Real Postgres schema + tRPC API (50+ endpoints) + auth; **no running API server runtime**, Redis not wired, no API autoscaling, no payment processor, client-side-only anti-cheat |
| Content / gameplay | 4/10 | ~111 `.holo` files but **2 static zones**, 0 fully-playable; quests/inventory/combat exist as polished *examples*, not wired into worlds |

### 2.1 What is genuinely real (do not discount)

- **HoloScript is a real runtime, not a description language.** Robust parser
  (`packages/core/src/parser/HoloCompositionParser.ts`; the Jan-2026 `#id`/nested-block failures
  are fixed), deterministic 60 fps loop (`packages/engine/src/runtime/GameLoop.ts`), native
  physics (`packages/engine/src/physics/PhysicsWorldImpl.ts`, rigidbody + soft body + collision
  events), event system (`packages/core/src/runtime/event-system.ts`), imperative scene execution
  (`packages/core/src/runtime/holo-composition-executor.ts`).
- **Low-level netcode works.** `packages/core/src/traits/NetworkedTrait.ts` (1,134 lines) +
  `packages/mesh/src/network/SyncProtocol.ts` (960 lines) do delta compression + client-side
  interpolation; WS + WebRTC transports with fallback. A 10–50 player social-VR experience is
  buildable today.
- **VR client is production-grade for its tier:** WebXR (Quest/Index/Vive) + 5-level adaptive
  frame-budget system hitting 90 fps.
- **Backend data model is mature:** users, sessions, quests, progression, social graph,
  creator-economy revenue split; multi-modal auth (email + wallet) works.

### 2.2 The gaps that block "AAA MMO" specifically

- **"AAA" is an architectural ceiling.** A JavaScript/browser/WebGL stack caps at 0.5–2M tris vs.
  6–10M for shipping AAA titles; no ray tracing, no dynamic GI, manual external asset pipeline.
  Not reachable by iterating the current renderer.
- **"MMO scale" is unbuilt, not just unfinished:** no server authority (clients can forge
  ownership; anti-cheat is client-trust only); interest management scaffolded but never called
  (`SpatialSharder.ts` has zero callers); no zone/shard server; no running API server entry point;
  the `MatchmakingService`/`RoomService` the roadmap calls "complete" are not instantiated.

### 2.3 Independent reality checks

- `central.hololand.io` does not resolve; `hololand.io` is a **marketing landing page**, not a
  playable client. No evidence of a live build or concurrent players.
- **Zero substantive MMO/netcode commits in the last 90 days** — recent activity is all
  "HoloShell" (a desktop custody tool). The MMO is not under active construction.

### 2.4 Honest framing

This is a **social-VR creation platform with AAA ambitions** — category-comparable to a
Rec Room / Roblox UGC model, not a Destiny/WoW AAA MMO. Realistic reachable targets:

- **Now:** single-player VR + small-group (10–50) social.
- **~1 quarter of focused backend work:** ~100–300 concurrent-per-instance "small MMO" at *web
  fidelity*.
- **AAA fidelity at MMO scale:** requires either retargeting the runtime to a native renderer
  (WebGPU/native, *not* a React/.tsx intermediary) or a multi-year build — not an incremental step.

---

## 3. The `.tsx` Compiler as Redundancy and Poison

### 3.1 Two paths that both build a scene

1. **AOT path:** `.holo → R3FCompiler → @generated .tsx → React Three Fiber → Three.js`
   (`packages/core/src/compiler/R3FCompiler.ts`, ~2,000 lines).
2. **Runtime path:** `.holo → parser → AST → holo-composition-executor → Three.js scene at
   runtime` (`packages/core/src/runtime/holo-composition-executor.ts`).

Both lower traits, materials, and transforms into renderable objects — in two places. That is a
duplication-of-logic surface where drift bugs live.

### 3.2 The poison mechanism (why "untrained on HoloScript" is the crux)

No agent family (Claude, Codex, Grok, Gemini) has meaningful HoloScript in its training corpus,
but all have *enormous* corpora of TypeScript/React. A compiler that emits `.tsx` therefore makes
the agent's competence gradient point **out** of HoloScript and into React: the agent drops down to
debug the generated `.tsx`, and from then on the generated language is the de-facto source. The
codegen path **trains agents to leave HoloScript.** This is the same instinct behind the existing
render-surface freeze (`scripts/holo-ci/check-render-surface-native.mjs`) — but the freeze stops
hand-written `.tsx` while the `.tsx` *compiler* keeps generating the surface the freeze exists to
burn down. Gating the output while blessing a generator for it is half a policy.

A compiler poisons the agent loop through one or both of:

1. **Training-gravity escape hatch** = (training-corpus size of target) × (editability of output).
2. **Runtime redundancy** = the target competes with `holo-composition-executor` as the thing that
   actually runs the product.

`.holo → .tsx` scores maximum on both. It is the apex case.

### 3.3 The four-question test for any compiler

- **Q1.** Target a general-purpose language an agent can fluently hand-write? (TS/JS/C#/Python/
  Swift/GDScript/C++) → escape-hatch risk.
- **Q2.** Output debugged / round-tripped by agents, or fire-and-forget? → if debugged, poison is
  *active*.
- **Q3.** Overlaps the native runtime as "what runs the product"? → redundancy.
- **Q4.** Target a data/interchange *format*, not a language? (URDF/USD/glTF/DTDL/OpenXR/WGSL-as-
  artifact) → low escape-hatch.

**Poison = (Q1 & Q2) or Q3. Safe ≈ Q4 and not Q3.**

### 3.4 Preliminary compiler triage (PARTIAL — ~12 of 54 named; full inventory pending)

| Tier | Compilers | Action |
|---|---|---|
| Apex poison — kill (runtime-redundant + top training gravity, web JS/TS) | `R3FCompiler`/`.tsx`, `Native2DCompiler`, `BabylonCompiler`, `PlayCanvasCompiler`, raw Three emitters | Retire into the native runtime (the §4 backlog) |
| Escape-hatch but legitimate one-way *export* — quarantine | `UnityCompiler` (C#), `UnrealCompiler` (C++/BP), `GodotCompiler` (GDScript), `VisionOSCompiler` (Swift) | Keep as fire-and-forget export; no round-trip; agents never debug output; fenced from the inner loop |
| Dead / POC — kill | `QuantumCircuitCompiler`, `Vector2DCompiler`, `PhoneSleeveVRCompiler`, `VRChatCompiler` | Delete |
| Safe — keep (interchange formats) | `WASMCompiler`, `URDF`/`SDF`, `DTDL`/`WoT`, `USD`, `glTF`, `OpenXR`, `A2A`, `SCM` | Keep |

> **Sharp distinction:** `WebGPUCompiler`/WGSL is **not** poison if it is the *internal lowering*
> the native runtime emits to drive the GPU — that is the correct low-level target. It becomes
> poison only if WGSL is treated as hand-edited source. Same code path, opposite verdict by intent.

> **Systemic note:** this is family-wide governance, not a `.tsx` bug. Per `CLAUDE.md`, the fluid
> families (Codex: "ship without hedging") are *most* likely to reflexively emit familiar
> target-language code. The fix is half "delete redundant compilers" and half "fence every
> escape-hatch compiler out of the agent inner loop" — treat engine exports like a `.pdf` export:
> a terminal artifact, never a working surface.

---

## 4. Trait-Runtime Parity Backlog

This is the concrete blocker set between today and a pure native runtime that makes the `.tsx`
codegen deletable.

### 4.1 Raw counts

- **101** traits the R3F/`.tsx` compiler emits (`R3FCompiler.ts:3230–3347`).
- **60** traits with a real native runtime handler (`packages/runtime/src/browser/BrowserRuntime.ts:24–90`,
  via `TraitSystem.register`).
- **22** PARITY-OK (both paths) — safe today.
- **79** POISON BACKLOG (R3F emits, native runtime silent) — gross blocker set.
- **~2,153** declared-only vocabulary (constants only, neither path) across 132 trait-constant
  groups (`packages/core/src/traits/constants/`).

Counting note: this enumerates **2,316 distinct trait *names*** vs. the earlier "~730 trait
*files*" figure — different units, same conclusion, sharper: **~93% of the trait vocabulary is
declaration-only.** Confidence ≈ 92%; the main caveat is runtime name-normalization (underscores
stripped), so a small number of "poison" entries may already be covered under a normalized name.

**Inverse finding (matters):** **38 native handlers exist that R3F does *not* emit** (`teleport`,
`weather`, `daynight`, `lod`, `haptic`, `handtracking`, `stat`/`luck`/`encounter`/`droptable`,
`emotion`, `memory`, `goaloriented`, `joint`, `rigidbody`, `snappable`, `breakable`, `character`,
`stackable`, `rotatable`, `mirror`, `particlesystem`, `uipanel`, …). Deleting the `.tsx` path loses
**nothing** on these — the native runtime is already the *more complete* path for gameplay traits.

### 4.2 The 79 triaged (it is really ~50 real blockers + ~12 no-ops)

| Tier | What a native runtime must do | ~Count | Examples | Real blocker? |
|---|---|---|---|---|
| 1 — Behavioral logic | A handler that acts each tick/event | ~17 | `ai_companion`, `ai_npc_brain`, `llm_agent`, `crowd_sim`, `gpu_physics`, `gpu_particle`, `deformable_terrain`, `soft_body_pro`, `chain`, `string`, `compute`, `follow`, `orbit`, `object_tracking`, `sensor`, `digital_twin` | **Yes — top priority** |
| 2 — Render / post-FX passes | Map to a WebGPU/Three render pass | ~16 | `bloom`, `god_rays`, `volumetric_clouds`, `volumetric_video`, `gaussian_splat`, `nerf`, `point_cloud`, `photogrammetry`, `shadow`, `web_surface`, `scene_reconstruction` | **Yes** |
| 3 — AR/XR sensing | WebXR / native sensor bridge | ~11 | `plane_detection`, `mesh_detection`, `persistent_anchor`, `shared_anchor`, `geospatial`, `light_estimation`, `occlusion`, `co_located`, `shareplay` | **Yes (XR surfaces)** |
| 4 — Spatial audio family | Web Audio / spatializer handlers | ~7 | `positional`, `ambisonics`, `hrtf`, `audio_occlusion`, `audio_portal`, `spatial_voice`, `head_tracked_audio` | **Yes** (`spatial_audio` itself is already parity-OK) |
| 5 — Passive / metadata | Likely **no handler** — declarative/policy/compile-time | ~12 | `material`, `alt_text`, `accessible`, `high_contrast`, `motion_reduced`, `moderation`, `anti_grief`, `token_gated`, `data_binding`, `attach`, `world_state`, `shared_world` | **No / verify** |

The high-end AAA-fidelity items (`bloom`, `gaussian_splat`, `volumetric_*`, `nerf`) cluster in
Tier 2 — exactly the render features a pure native runtime would have to implement itself, which
is the same fidelity ceiling §2.2 flags.

### 4.3 PARITY-OK (22) — the proof the pattern works

`anchor`, `animated`, `behavior_tree`, `buoyancy`, `cloth`, `collidable`, `destruction`, `fluid`,
`grabbable`, `hoverable`, `look_at`, `networked`, `patrol`, `perception`, `physics`, `portal`,
`reverb_zone`, `rope`, `soft_body`, `spatial_audio`, `voice_proximity`, `wind`
(each: R3F `name === '...'` at `R3FCompiler.ts:3230–3347` ↔ handler at `BrowserRuntime.ts:24–90`).

---

## 5. Sequencing: Complete Native Runtime → Delete `.tsx` Codegen

Order of operations (each step gated on the prior):

1. **Classify Tier 5 (~12) as runtime no-ops** — confirm each is declarative/policy/compile-time
   and needs no handler. Cheap; removes ~12 from the blocker count immediately.
2. **Reconcile name-normalization** — verify which "poison" entries already resolve to an existing
   handler under the underscore-stripped name. Removes false positives.
3. **Close Tier 1 behavioral handlers (~17)** in `holo-composition-executor` / `TraitSystem`. These
   are gameplay-critical and the highest leverage for the MMO direction.
4. **Close Tier 4 audio (~7)** then **Tier 3 AR/XR sensing (~11)** — surface-bounded, can parallelize.
5. **Close Tier 2 render passes (~16)** against the native WebGPU/Three path — this is also the
   AAA-fidelity work; sequence it with the renderer roadmap.
6. **Parity gate:** add a CI check asserting *every* R3F-emitted trait has a native handler (or an
   explicit no-op classification). When green, the R3F path is provably non-load-bearing.
7. **Retire `R3FCompiler` + the other apex-poison web compilers** (§3.4 tier 1); migrate any
   remaining consumers to the native runtime.
8. **Quarantine the engine-export compilers** (§3.4 tier 2) behind a fire-and-forget boundary;
   delete the POC compilers (§3.4 tier 3).

Steps 1–2 are audits (days). Steps 3–5 are the real engineering backlog. Step 6 is the safety
interlock that makes step 7 non-breaking.

---

## 6. Proposed Board Tasks

1. `audit: classify Tier-5 R3F traits as native no-ops (~12)` — §5.1.
2. `audit: reconcile trait name-normalization false-positives in parity set` — §5.2.
3. `feat(runtime): Tier-1 behavioral trait handlers (~17)` — §4.2 tier 1.
4. `feat(runtime): Tier-4 spatial-audio trait handlers (~7)`.
5. `feat(runtime): Tier-3 AR/XR sensing trait handlers (~11)`.
6. `feat(runtime): Tier-2 render-pass trait handlers (~16)` — couple to renderer roadmap.
7. `ci: parity gate — every R3F-emitted trait has a native handler or no-op classification` — §5.6.
8. `chore(compiler): full 54-compiler poison inventory (four-question test)` — §3.4 completion.
9. `chore(compiler): retire apex-poison web compilers once parity gate is green` — §5.7.

---

## 7. What Remains After This Plan (honest gap)

This plan retires the `.tsx` codegen redundancy and closes trait-runtime parity. It does **not** by
itself make HoloLand a AAA MMO. Explicitly left unaddressed:

- **Server authority & anti-cheat.** Parity does nothing for the missing server-authoritative
  model; clients can still forge ownership. This is a separate, larger track.
- **MMO-scale networking.** Wiring interest management into the sync broadcast path, a zone/shard
  server, and load testing to thousands of concurrents are all still open.
- **Running backend.** The tRPC API still has no deployed HTTP entry point; Redis is still unwired;
  there is still no payment processor or inventory persistence.
- **AAA rendering ceiling.** Even with Tier-2 render handlers native, the WebGL/browser polygon and
  lighting ceiling (no ray tracing / GI; 12–20× poly gap) remains. Closing it likely means a
  WebGPU/native renderer, which is a major track of its own.
- **Compiler inventory is partial.** §3.4 covers ~12 of 54 compilers; the kill/quarantine/keep list
  is not final until the full inventory (board task #8) runs.
- **Content.** 2 static zones and example-only gameplay systems remain; parity does not produce a
  playable world.
- **Confidence caveat.** Parity counts are ~92% confidence; the live MCP/codebase-intelligence
  tools were unreachable from the sandbox, so all evidence is from static source reading.

The honest one-line summary: *this is the substrate-hygiene track that makes native HoloScript the
single authoring/runtime surface — necessary for the MMO direction, nowhere near sufficient for it.*

---

## 8. Provenance

- Methodology: five parallel capability deep-dives (networking, rendering, backend/infra, language
  runtime, content) + a dedicated trait-parity scan, all by direct source reading; cross-checked
  against live-endpoint probes and 90-day commit history.
- Key files: `R3FCompiler.ts`, `holo-composition-executor.ts`, `BrowserRuntime.ts`,
  `traits/constants/`, `NetworkedTrait.ts`, `SyncProtocol.ts`, `SpatialSharder.ts`,
  `packages/engine/src/physics/PhysicsWorldImpl.ts`, `packages/engine/src/runtime/GameLoop.ts`.
- Not verified: live MCP tools (`holo_graph_status`, etc.) — `mcp.holoscript.net` unreachable from
  the research sandbox.
