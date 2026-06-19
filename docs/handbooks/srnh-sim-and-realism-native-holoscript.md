# SRNH — SIM and REALISM for Native HoloScript

> **Status:** doctrine + honest architecture map. Created 2026-06-19.
> **Audience:** agents (Claude + local IDE agents especially) building visual / simulated
> HoloScript experiences. **Companion docs:** [`holoscript-native-authoring-vs-pretrained.md`](holoscript-native-authoring-vs-pretrained.md)
> (author behavior as data), [`../native-engine-registry.md`](../native-engine-registry.md)
> (sovereign vs bridge engines, the machine-readable SSOT).
>
> Every maturity verdict below was produced by **reading the actual implementation code**
> (file:line cited), not docs or tests. A green test or a "compiled OK" signal proves the
> scaffold ran — **not** that a wired, photoreal render or a correct simulation happened.
> When the code and an older optimistic doc disagree, the code wins.

---

## 0. Why this exists (the three rules that triggered it)

1. **Realistic, never primitive-as-placeholder.** A Lambert-shaded cube labeled
   "BehemothBoar" is hollow theater. If we represent an entity, it is generated /
   reconstructed / asset-backed realistic content, or it is honestly labeled a placeholder —
   never a basic shape passed off as the real thing.
2. **Native = sovereign, never bridge/poison.** "Native render" means the **sovereign**
   stack (our WebGPU renderer, SDF raymarch, 3DGS, WASM/VM). **R3F / Three.js / Babylon /
   Unity / Unreal / Godot are *bridge* targets** — valuable interop, but they make the
   render depend on a third-party engine. Reaching for them to satisfy a *native* claim is
   the pretrained reflex ("grab the popular framework") and is banned for sovereignty work.
3. **Research the architecture first, then build from the real blocks.** For Claude and
   local IDE agents especially: do not hand-roll a demo before you understand the native
   pipeline. Investigate natively (this doc, `/codebase`, real files), find the real block,
   and extend it — don't route around it. (F.126, F.127.)

The rest of this document is the **honest inventory of those real blocks** so the next agent
extends what exists instead of re-deriving it or faking it.

---

## 1. The thesis: one `.holo` is simultaneously a render and a simulation

HoloScript's differentiator is not "another renderer." It is that **a single `.holo` scene,
authored once as data, is both a photoreal render (REALISM) and a verifiable physical
simulation (SIM), sharing one trait library and one provenance receipt.** Digital twin before
physical twin.

The `@advanced_pbr` boulder in `examples/showcase/realistic-forest.refreshed.holo:159` is the
canonical example: the *same* declaration carries `model: "models/boulder.glb"` (realism:
asset-backed mesh + PBR maps) **and** `collider`/`rigidbody`/`mass` (sim: it falls, collides,
and can emit a CAEL receipt proving the run replayed deterministically). REALISM makes it look
right; SIM makes it *behave* right and *prove* it. SRNH is the doctrine for keeping both halves
real.

---

## 2. REALISM — honest architecture map

### 2.1 The genuine moat: 3D Gaussian Splatting (REAL)

This is HoloScript's strongest photoreal pipeline and it is real end-to-end:

- **GPU radix sort** — `packages/engine/src/gpu/GaussianSplatSorter.ts:112-754` — wait-free
  4-pass 8-bit Blelloch radix sort, ping-pong buffers, premultiplied back-to-front blend.
- **EWA render shader** — `packages/engine/src/gpu/shaders/splat-render-sorted.wgsl:126-233` —
  textbook 2D-Gaussian rasterization (projects center, inverse-covariance conic, 3σ billboard,
  `alpha = opacity·exp(-0.5·dᵀΣ⁻¹d)`).
- **KHR glTF export + covariance-from-pointcloud** —
  `packages/core/src/compiler/GaussianSplattingCompiler.ts:315-646` (kNN → 3×3 covariance →
  Jacobi eigendecomposition → quaternion). Real `KHR_gaussian_splatting`.
- **Authoring:** `@gaussian_splat { source, format, quality, max_splats, sh_degree, … }`
  (`examples/volumetric/01-gaussian-splat-static.holo`).

**Caveats to respect:** with no valid splat data the export silently emits an 8-splat demo
cube (`GaussianSplattingCompiler.ts:276-279`) — "compiled OK" ≠ real scene flowed through.
Cloud baking/training is a Render-Network **job client**, not local training
(`GaussianSplatBakingPipeline.ts`). And the `WebGPUCompiler`'s *inline* splat shader is a
toy placeholder (§2.3) — the real renderer is `GaussianSplatSorter`.

### 2.2 The sovereign renderer (REAL) vs the preview emit (PARTIAL)

There are two different things both called "WebGPU":

- **`WebGPURenderer`** — `packages/engine/src/rendering/webgpu/WebGPURenderer.ts` — the real
  sovereign GPU renderer: owns device/pipelines/shaders/buffers + WebXR, zero Three.js
  (`native-engine-registry.md`). This is the engine.
- **`WebGPUCompiler`** — `packages/core/src/compiler/WebGPUCompiler.ts` — the AST→WGSL **code
  emitter** that backs `compile_to_webgpu` + `POST /api/compile/webgpu-preview`. Its emit is
  **thin/non-photoreal today**, and (verified 2026-06-19) ships **three bugs that make the
  preview non-functional or flat**:
  1. **Undefined geometry generators** — `geometryVertexDataFn` (`WebGPUCompiler.ts:790-801`)
     emits calls to `generateSphereVertices`/`generateCubeVertices`/… but `emitShaderSources`
     never defines them → `ReferenceError`, blank canvas.
  2. **No view-projection** — `WGSL_VERTEX` (`:548-559`) does `o.clip = u.model * pos` with no
     camera matrix; `emitCamera` builds `vpUniform` only when a camera block exists, never
     binds it into the shader, and computes projection-only (no lookAt view). Result: objects
     render in raw world space → off-screen.
  3. **Lambert, not PBR** — the fragment shader (`:566-569`) is a single hardcoded diffuse
     term with a fixed light dir; metalness/Fresnel/specular in the material buffer are
     ignored. Geometry falls back to primitives (`:790-801`) — the exact "basic shapes" we are
     moving past.
  - A 4th bug lives in the preview wrapper, not the compiler: the TS→JS strip in
    `packages/mcp-server/src/renderer.ts:585-598` (`generateWebGPUBrowserTemplate`) corrupts
    `usage: GPUTextureUsage.RENDER_ATTACHMENT` → `usage.RENDER_ATTACHMENT` via a blunt
    `: <Type>` regex.

A corrected, hand-written reference (real geometry generators + lookAt·perspective VP + the
compiler's real WGSL) renders both shapes natively in headless Chrome — proving the fix is the
emit, not the architecture. Fixing these four is **build-block B1** (§5).

### 2.3 Post-processing (REAL shaders, PARTIAL executor)

- **WGSL post-FX shaders** — `packages/engine/src/rendering/postprocess/PostProcessShaders.ts`
  (bloom, 10 tonemap operators incl. ACES/Uncharted2/Khronos-PBR, FXAA, SSAO/HBAO, SSR, SSGI,
  DOF, fog, color grading) — **real shader code**.
- **Executor gaps** — depth-dependent effects sample a depth texture at `@binding(3)` that the
  bind groups never provide; `PostProcessPipeline.copyTexture()` is a clear-to-black stub
  (`PostProcessPipeline.ts:357-374`). The **live R3F/GLSL** post-FX stack
  (`packages/r3f-renderer/src/components/PostProcessingRenderer.tsx`) *is* wired into the
  runtime loop — but that is the bridge path, not sovereign.

### 2.4 PBR materials (REAL math, UNWIRED to GPU; REAL multi-engine codegen)

- **`AdvancedPBR.ts`** (`packages/engine/src/rendering/AdvancedPBR.ts:91-444`) — correct GGX /
  Smith / Schlick / anisotropic / Charlie-sheen / thin-film iridescence — but **CPU-only and
  imported by nothing**: a tested math library with no GPU consumer.
- **`AdvancedPBRTrait.ts`** — real string-template material codegen for Unity HDRP / Unreal /
  Godot4 / Three.js `MeshPhysicalMaterial`; the WebGPU branch is an incomplete shader fragment.
- **Live R3F material assembly** (`r3f-renderer/src/runtime/compiledMaterial.ts`) is wired —
  clearcoat/transmission/sheen/iridescence/IOR — but again, the bridge path.
- **Authoring:** `material "X" @advanced_pbr { base_color, roughness, metallic, albedo_map,
  normal_map, ao_map, height_map, subsurface, … }` (`realistic-forest.refreshed.holo:108-155`).

### 2.5 NeRF / neural fields / "Brittney v43" worldgen — FACADE

No neural-field renderer exists in-tree (no MLP, no ray march, no hash grid).
`Sovereign3DAdapter.ts:104-293` is an **HTTP client** to an undeployed endpoint
(`https://api.holoscript.net/sovereign`) with a built-in `mockMode` that fabricates splat/tri
counts and `world.neural` URLs. `NeRFTrait.ts:25-56` is a metadata shell (`trainStep++`, no
field eval). **Do not claim native neural-field rendering.**

### 2.6 Holograms — PARTIAL (2.5D, not volumetric)

`hologram-renderer.ts:227-247` is an honest monocular-depth + horizontal-parallax pixel-warp
(real DepthAnything-v2 ONNX depth at `hologram-depth-estimator.ts:31-158`), tiled into
Looking-Glass quilts + side-by-side "MV-HEVC **preview**". It is real for what it is — **not**
volumetric light-field capture.

### 2.7 REALISM maturity table

| Block | Verdict | Evidence |
|---|---|---|
| 3DGS GPU sort + EWA render | **REAL** | `engine/src/gpu/GaussianSplatSorter.ts:112-754`; `splat-render-sorted.wgsl:126-233` |
| 3DGS KHR glTF export | **REAL** (demo-grid fallback) | `core/src/compiler/GaussianSplattingCompiler.ts:315-646,276-279` |
| Sovereign `WebGPURenderer` engine | **REAL** | `engine/src/rendering/webgpu/WebGPURenderer.ts` |
| `WebGPUCompiler` preview emit | **PARTIAL/THIN** (4 bugs; Lambert+primitive) | `core/src/compiler/WebGPUCompiler.ts:548-559,566-569,790-801`; wrapper `mcp-server/src/renderer.ts:585-598` |
| Post-FX WGSL shaders | **REAL** | `engine/src/rendering/postprocess/PostProcessShaders.ts` |
| Post-FX WGSL executor | **PARTIAL** (depth unbound; copy stub) | `PostProcessEffect.ts`; `PostProcessPipeline.ts:357-374` |
| Post-FX live R3F/GLSL | **REAL** but **bridge** | `r3f-renderer/src/components/PostProcessingRenderer.tsx` |
| Advanced PBR BRDF (math) | **REAL but UNWIRED** | `engine/src/rendering/AdvancedPBR.ts:91-444` (zero consumers) |
| Multi-engine material codegen | **REAL** (bridge targets) | `core/src/traits/AdvancedPBRTrait.ts:165-748` |
| NeRF / neural field / Brittney v43 | **FACADE** | `core/src/world/adapters/Sovereign3DAdapter.ts:104-293` |
| Holograms (quilt/stereo) | **PARTIAL** (2.5D) | `mcp-server/src/hologram-renderer.ts:227-247` |

---

## 3. ASSETS — how realistic content enters (honest map)

Realism needs realistic *input*. The honest state: **two real doors, several honest gaps.**

| Path | Verdict | Evidence |
|---|---|---|
| `import_gltf` (pre-made `.glb` → `.holo`) | **REAL** (hierarchy/materials/traits; mesh referenced) | `mcp-server/src/gltf-import-tools.ts:125,326,442` |
| `generate_3d_object` (Meshy/Tripo text→3D) | **REAL** but **external paid SaaS, key-gated, non-sovereign** | `cli/src/importers/text-to-3d-importer.ts:49,143,263` |
| `holo_generate_mesh` (SDF marching cubes) | **REAL** (authored geometry, not prompt) | `mcp-server/src/generate-mesh-tools.ts:83` |
| `generate_object`/`scene`/`world` (LLM→.holo) | **REAL code-gen / PLACEHOLDER geometry** | `mcp-server/.../generators.ts:539,796,1082` — emits primitive `.holo` |
| `generate_world` sovereign path | **UNDEPLOYED** (refuses default endpoint) | `generators.ts:821` |
| `holo_reconstruct_*` (video→3D) | **PARTIAL** — real ffmpeg ingest; **heuristic** plane+luminance depth, untrained weights | `HoloMapRuntime.ts:807-826,153`; `holoMapMicroEncoder.ts:71` |
| `compile_to_gltf` of imported/realistic mesh | **LOSSY** — drops non-primitive geometry, emits empty node | `GLTFPipeline.ts:1489-1494` |
| `rig_match_skeleton` | **REAL** (name-match + RefusableDiff; not retarget exec) | `tools/rig_match_skeleton.ts:134` |
| Brittney `Sovereign3DAdapter` backend | **client REAL / backend UNBUILT / mock = fixture** | `Sovereign3DAdapter.ts:104,261,821` |

**Rule:** never present `generate_world` / `generate_scene` output or default reconstruction
as realistic — they are primitive placeholders or heuristic scaffolds *by construction*. The
real doors for realistic assets today are **glTF import** and **Meshy/Tripo** (external).
Sovereign realistic generation is an honest, declared capability gap, not a shipped feature.

---

## 4. SIM — honest architecture map (the strong half)

| Block | Verdict | Evidence |
|---|---|---|
| `solve_structural` (TET4/TET10 FEM) | **REAL** | `engine/src/simulation/StructuralSolver.ts:513-637`; `StructuralSolverTET10.ts:24-57` |
| `solve_thermal` (FDM heat eq + CFL) | **REAL** | `engine/src/simulation/ThermalSolver.ts:30-45` |
| ~30 sibling solvers (NS, FDTD, MD, DEM, PBD…) | **REAL** | `engine/src/simulation/*Solver.ts` (+ tests) |
| Native rigidbody engine (GJK/EPA, islands) | **REAL** (replaced cannon-es, D.083) | `engine/src/physics/PhysicsWorldImpl.ts` |
| **Simulation Contract / ESC** | **REAL, rigorous** — `verified` is *derived*; fake-proof clauses throw at construction; mesh-sanity beyond hash | `engine/src/simulation/SimulationContract.ts:1833,892,1198` |
| ESC applied to MCP `solve_*` path | **PARTIAL** — MCP uses lighter `LocalTraceRecorder`, not full `ContractedSimulation` | `mcp-server/src/simulation-tools.ts:481` |
| CAEL receipts (hash-chain + replay) | **REAL** | `simulation-tools.ts:481-544,774-853` |
| CAEL default hash strength | **PARTIAL** — FNV-1a (tamper-*evident*); SHA-256 opt-in | `SimulationContract.ts:971` |
| `.holo` physics traits → compile | **REAL** (ProvenanceSemiring merge → `rigidBody`) | `core/src/compiler/R3FCompiler.ts:3227-3367` |
| `twin_earth` safety gate + dispatch order | **REAL** | `framework/src/board/twin-earth-substrate.ts:459`; `robot-dispatcher.ts:209` |
| `twin_earth_robot_actuate` (hardware) | **STUB** (honest, `simulated:true`) | `robot-dispatcher.ts:99` |
| `twin_earth` identity/persistence | **THIN** (in-memory, attestation unverified) | `robot-ai-mcp-tools.ts:88,143` |
| `sim_run_paid` local execution | **REAL** (fail-loud) | `simulation-billing-tools.ts:521-548` |
| `sim_run_paid` billing / fleet | **SYNTHETIC / UNWIRED** (refuses fake success) | `simulation-billing-tools.ts:339,571-588` |

**The honest framing:** a green CAEL receipt proves the run **happened and replays
deterministically** (and, with clauses, that declared assertions held) — not, by hash alone,
that the physics is *correct*. The Simulation Contract (mesh-sanity + falsifiable clauses) is
what pushes "happened" toward "was right." Default FNV-1a means "tamper-evident," not
"tamper-proof"; say so. And "every solve is contracted" is **not yet literally true** at the
MCP surface — that gap is real work, not a claim to make.

---

## 5. Build blocks — what to build next (prioritized)

These are the concrete, evidence-backed next moves to close the gap between *authored* realism
(`realistic-forest.refreshed.holo` is rich) and *rendered* realism (the sovereign preview is
flat). Each is a real seam to extend — not a new parallel system.

- **B1 — Fix the sovereign WebGPU emit (4 bugs, §2.2).** Emit the geometry generators; always
  emit a lookAt·perspective view-projection and bind it into `WGSL_VERTEX`; replace the
  blunt-regex TS strip with a real transpile (or emit JS-safe code). Reference fix verified to
  render in headless Chrome. *Smallest, highest-leverage block.*
- **B2 — Wire `AdvancedPBR` into `WebGPUCompiler`'s fragment shader.** The correct BRDF
  already exists (`AdvancedPBR.ts`) and has zero consumers; replace the Lambert term so
  `@advanced_pbr` materials actually shade as PBR on the sovereign path.
- **B3 — Wire the real 3DGS renderer into the preview.** The inline splat shader is a toy; the
  compiler already delegates *sorted* splats to `GaussianSplatSorter` — make the preview serve
  that path so `@gaussian_splat` scenes render photoreal.
- **B4 — Load `.glb` models + PBR texture maps in the sovereign renderer.** So
  `model: "models/boulder.glb"` renders the boulder, not a primitive — closing the
  authored-vs-rendered realism gap directly.
- **B5 — Complete the WGSL post-FX executor** (bind depth at `@binding(3)`; replace the
  clear-to-black `copyTexture` with a real blit) so bloom/SSAO/SSR/tonemap run on the sovereign
  path, not only in R3F.
- **B6 — Name the realistic-asset door.** Either stand up the sovereign-3d generation backend,
  or adopt Meshy/Tripo as the *declared, key-gated* realistic-asset path — and stop letting
  `generate_world` fall back to primitives silently.

Track these on the HoloMesh board; do not fake any of them with a placeholder that a test
passes against.

---

## 6. Doctrine checklist (TL;DR for agents)

- [ ] **Researched the native block before building?** (this doc / `/codebase` / real files).
- [ ] **Realistic, not primitive?** If you're rendering a cube/sphere and naming it a thing,
      stop — load a real asset (`import_gltf`, `@gaussian_splat`, Meshy/Tripo) or label it a
      placeholder honestly.
- [ ] **Native = sovereign?** Render claim uses WebGPU/3DGS/SDF/WASM — **not** R3F/Three.js/
      Babylon (those are bridge/interop, named as such).
- [ ] **Extending the real seam, not routing around a broken one?** Repair the canonical
      surface; don't fork a parallel demo.
- [ ] **SIM correctness gate-enforced, not asserted?** `verified` derived, CAEL receipt
      attached, hash strength named (FNV-1a = evident, SHA-256 = proof).
- [ ] **No "compiled OK ⇒ real" overclaim?** A passing compile/test proves the scaffold, not a
      wired photoreal render or correct physics. Verify by *looking* / *replaying*.

> SRNH in one line: **author once as data; render it real on the sovereign stack; simulate it
> with a gate-enforced receipt — and never pass a basic shape off as the thing it represents.**
