# Compiler Poison & the Native Runtime — Full 64-Compiler Inventory (Capstone)

**Date:** 2026-06-15
**Author:** Claude (claude-opus, branch `claude/hololand-holoscript-aaa-mmo-rbhty7`)
**Companion to:** `research/2026-06-15_trait-parity-and-tsx-deprecation.md` (the trait-runtime
parity backlog). This is the capstone: it generalizes the `.tsx`-poison finding across **all 64
compilers** in the HoloScript tree and adds the value axes (token economics + utility) the parity
doc did not cover.
**Status:** Research / decision input. Inventory data + an evaluation model + proposed board tasks.
Not a shipped code change.

---

## 1. Executive Summary

The `.holo → .tsx` (R3F) compiler is not a one-off mistake — it is the worst instance of a
**pattern** that recurs across the compiler matrix. Inventorying all 64 `*Compiler.ts` files and
scoring each against a substrate axis (does it pull agents out of native HoloScript?) and a value
axis (does authoring through it actually save tokens / deliver utility?) yields:

| Verdict | Count | Meaning |
|---|---|---|
| **APEX-POISON** | 9 | High training-gravity *and* duplicates the native runtime → kill / fold into native runtime |
| **ESCAPE-HATCH-EXPORT** | 18 | High training-gravity, real export utility → keep but **quarantine** (fire-and-forget, agents never debug output) |
| **SAFE-FORMAT** | 16 | Low training-gravity interchange formats → keep (these are HoloScript's *strongest* token-economy wins) |
| **GPU-LOWERING** | 5 | WGSL/GLSL — safe **iff** internal lowering, poison **iff** hand-edited source |
| **INTERNAL-INFRA** | 14 | Compilation plumbing, not a defection target → keep |
| **DEAD/POC** | 2 | Orphan, no live consumer → delete |
| **Total** | **64** | OUTPUT-TARGET: 45 · INTERNAL/GPU: 19 |

**Core conclusions:**

1. **9 apex-poison compilers** all emit JS/TS web-3D and duplicate the runtime executor:
   `R3FCompiler`, `ThreeJSCompiler`, `BabylonCompiler`, `PlayCanvasCompiler`, `Native2DCompiler`,
   `PhoneSleeveVRCompiler`, `FlatSemanticCompiler`, `VRRCompiler`, `ARCompiler`. **This kill-list
   is the same backlog as "complete the native runtime"** — retiring them *is* closing the
   trait-parity gap from the companion doc.
2. **HoloScript's value is not uniform across targets** (your point: "reduces tokens for some but
   not all"). Its *strongest* justification is the SAFE-FORMAT bucket — verbose interchange formats
   (URDF/USD/DTDL/SDF) where a few `.holo` lines expand to hundreds of lines no agent would
   hand-write, with zero escape-hatch risk. Its *weakest* is the apex-poison bucket, where the
   token "win" evaporates the moment an agent reads the generated `.tsx`.
3. The fix is two-pronged: **delete/fold apex-poison + dead**, and **govern the escape-hatch
   exports** so agents never round-trip through them — enforced by the `.holo → .hsplus → .hs → .ts`
   authoring hierarchy.

---

## 2. The Evaluation Model

A compiler must be judged on **two independent axes**. Poison is one axis; value is the other.

### 2.1 Substrate axis — does it pull agents out of native HoloScript? (the four-question test)

No agent family (Claude/Codex/Grok/Gemini) has meaningful HoloScript in its training corpus, but
all have enormous corpora of the popular target languages. A compiler emitting such a target makes
the agent's competence gradient point *out* of HoloScript.

- **Q1 lang-gravity.** General-purpose language with a large training corpus, hand-editable?
  (TS/JS/C#/Python/Swift/GDScript/C++ = HIGH; WGSL/GLSL = MED; XML/JSON/binary = LOW; internal IR = N/A)
- **Q2 round-trip.** Is the output debugged/maintained by agents, or fire-and-forget?
- **Q3 runtime-overlap.** Does it duplicate `holo-composition-executor` / `BrowserRuntime` as
  "what runs the product"?
- **Q4 format-not-language.** Is the target a data/interchange format? → low escape-hatch.

**Poison = (Q1 & Q2) or Q3.**

### 2.2 Value axis — does authoring through it actually pay? (token economics + utility)

HoloScript justifies a target through **either** of two independent values:

- **Token economy.** A `.holo` source that expands into a large target output is a compression
  win — *but only if the agent never has to read the expanded output.* Verbose targets
  (USD/URDF/Unity-C#/shader code) win big; targets where `.holo` is as verbose as the output, or
  where the agent must read the generated code to debug it, win nothing or go negative.
- **Utility.** Value independent of token count: one source → many targets, validation, trait
  semantics, provenance, cross-platform reach.

A target is **justified** if it scores token-economy OR utility, **and** is not poison.

### 2.3 The precise token mechanism (why `.tsx` is negative-value)

Writing `.holo` to get `.tsx` is a token win *only while the `.tsx` stays unread*. The instant an
agent debugs the generated `.tsx`, you pay the tokens **twice** (author `.holo` + read/edit
`.tsx`) **and** the agent has now defected to TypeScript. So apex-poison compilers are
double-losers: negative token economy *and* substrate poison. SAFE-FORMAT compilers are the
inverse: the agent writes a little `.holo`, never reads the URDF/USD, and gets a verbose, valid
artifact — pure positive economy, zero poison.

### 2.4 The authoring hierarchy (the discipline this all serves)

The intended fallback order for an agent authoring in this ecosystem:

```
.holo      ← declarative scenes/worlds — highest level, best token economy, agent-readable graph
.hsplus    ← full programming logic in HoloScript (loops, async, state)
.hs        ← simple HoloScript
.ts        ← FALLBACK ONLY when the HoloScript codebase genuinely cannot support the need
             (bridge / tooling / runtime infra) — the legitimate bottom of the hierarchy
```

**The distinction that the whole poison analysis turns on:**

- **Authored `.ts` (legitimate).** Agent writes TypeScript because HoloScript can't yet express the
  capability. This is *falling down* the hierarchy on purpose — fine.
- **Generated `.tsx` that becomes authored (poison).** A compiler emits `.tsx` from `.holo`, then
  an agent edits the `.tsx`. This *inverts* the hierarchy: the agent is *pushed* to the bottom by
  the codegen path even when `.holo` would have sufficed.

The render-surface freeze (`scripts/holo-ci/check-render-surface-native.mjs`) already blocks
hand-written `.tsx`. The gap: it does not block the `.tsx` **compiler** that keeps generating the
same surface. This capstone closes that gap conceptually — gate the generator, not just the hand.

---

## 3. Full Inventory (64 compilers, classified)

OUTPUT-TARGET vs INTERNAL-INFRA, with target, lang-gravity (Q1), runtime-overlap (Q3), live/dead
consumer evidence, and verdict. LOC approximate.

### 3.1 APEX-POISON (9) — kill / fold into native runtime

| Compiler | Target | Q1 | Q3 | Live? | LOC |
|---|---|---|---|---|---|
| `R3FCompiler` | TS / React Three Fiber | HIGH | YES | LIVE (2 tests) | ~4380 |
| `ThreeJSCompiler` | TS / vanilla Three.js | HIGH | YES | LIVE, no tests | ~1200 |
| `BabylonCompiler` | TS / Babylon.js | HIGH | YES | LIVE (35k test) | ~999 |
| `PlayCanvasCompiler` | JS / PlayCanvas | HIGH | YES | LIVE (39k test) | ~999 |
| `Native2DCompiler` | HTML / React `.tsx` UI | HIGH | YES | LIVE | ~1228 |
| `PhoneSleeveVRCompiler` | HTML5 stereoscopic Three.js | HIGH | YES | LIVE, no tests | ~1763 |
| `FlatSemanticCompiler` | React / R3F (semantic canvas) | HIGH | YES | LIVE (12k test) | ~1200 |
| `VRRCompiler` | Three.js / Babylon (VRR twin) | HIGH | YES | LIVE, no tests | ~1149 |
| `ARCompiler` | WebXR / AR.js JS | HIGH | YES | LIVE, no tests | ~1050 |

All nine emit a JS/TS web-3D scene and duplicate the native runtime. They are the gross
**~12k+ LOC** that the native runtime + trait-parity backlog (companion doc) replaces.

### 3.2 ESCAPE-HATCH-EXPORT (18) — keep, but quarantine

High lang-gravity, **no** runtime overlap → real one-way export utility, but agents must never
debug their output.

| Compiler | Target | LOC | Note |
|---|---|---|---|
| `UnityCompiler` | C# / MonoBehaviour | ~1019 | largest engine target |
| `UnrealCompiler` | C++ / UE5 Blueprint | ~1100 | 7k test |
| `GodotCompiler` | GDScript (Godot 4) | ~1000+ | no tests |
| `IOSCompiler` | Swift / ARKit | ~2100 | 4 tests, LIVE |
| `AndroidCompiler` | Kotlin / ARCore | ~2100 | 2 tests, LIVE |
| `AndroidXRCompiler` | Kotlin / Jetpack Compose XR | ~1400 | experimental |
| `VisionOSCompiler` | Swift / RealityKit | ~1100 | no tests |
| `MVHEVCCompiler` | MV-HEVC / Swift (Vision Pro) | ~1000 | has test |
| `OpenXRCompiler` | C++ / Vulkan+GLES | ~1215 | no tests |
| `AIGlassesCompiler` | Kotlin Compose / Glimmer | ~800 | experimental |
| `Canvas2DGameCompiler` | HTML5 Canvas game | ~1100 | no tests |
| `Vector2DCompiler` | React SVG | ~950 | Studio consumer |
| `NextJSCompiler` | Next.js page.tsx | ~1100 | wraps Native2D |
| `NextJSAPICompiler` | Next.js API route.ts | ~1200 | 15k test |
| `NodeServiceCompiler` | Node.js / Express | ~1259 | experimental |
| `NFTMarketplaceCompiler` | Solidity ERC-1155 | ~1050 | experimental |
| `VRChatCompiler` | UdonSharp C# / VRC SDK3 | ~1200 | overclaimed, incomplete |
| `WASMCompiler` | WebAssembly WAT/WASM | ~1616 | 13k test |

> Note: `NextJSCompiler` wraps `Native2DCompiler`, so it inherits apex-poison risk on its render
> surface even though its server/API role is legitimate. Treat its render output as poison, its
> API output as escape-hatch.

### 3.3 SAFE-FORMAT (16) — keep; HoloScript's strongest token-economy wins

Low lang-gravity interchange formats; agents do not defect to hand-writing them; `.holo` → verbose
artifact is pure compression.

`URDFCompiler` (ROS2/Gazebo XML, 27k test) · `USDPhysicsCompiler` (.usda, 24k test, NVIDIA Isaac) ·
`USDZExportCompiler` (USDZ adapter) · `SDFCompiler` (Gazebo SDF XML, 30k test) ·
`DTDLCompiler` (Azure Digital Twins JSON, 30k test) · `GaussianSplattingCompiler` (glTF
KHR_gaussian_splatting) · `OpenXRSpatialEntitiesCompiler` (spatial-anchor JSON) ·
`A2AAgentCardCompiler` (agent-card JSON) · `SCMCompiler` (causal-DAG JSON) ·
`QuantumCircuitCompiler` (OpenQASM 3.0) · `NIRCompiler` (neuromorphic graph JSON) ·
`QuiltCompiler` (Looking Glass quilt tiles) · `CodeEditorCompiler` (CodeMirror config JSON) ·
`ContextCompiler` (CLAUDE.md / .cursor/rules / MCP config, 2926 LOC, ratified 2026-05-06) ·
`LLMProviderCapabilitiesCompiler` (capability matrix) · `MCPConfigCompiler` (IDE MCP config JSON).

### 3.4 GPU-LOWERING (5) — safe iff internal lowering, poison iff hand-edited

`WebGPUCompiler` (WGSL, 41k test) · `TSLCompiler` (trait→WGSL, 4k test) ·
`ShaderGraphCompiler` (WGSL, prod test) · `SDFRayMarchCompiler` (GLSL, 1892 test) ·
`NIRToWGSLCompiler` (NIR→WGSL).

> These are the **correct** low-level target the native runtime *should* emit to drive the GPU.
> Verdict flips only by intent: internal lowering = keep and lean on; hand-edited WGSL source =
> poison. They are *not* in the kill list.

### 3.5 INTERNAL-INFRA (14) — compilation plumbing, keep

`IncrementalCompiler` · `StateCompiler` · `TraitCompositionCompiler` · `MultiLayerCompiler` ·
`PipelineCompiler` · `PipelineNodeCompiler` · `NodeGraphCompiler` (logic) · `GraphCompiler`
(scripting) · `PlatformConditionalCompiler` · `HolobCompiler` (HoloBytecode/HoloVM — internal
target) · `ProceduralCompiler` (LLM safety-wrap) · `useCompiler` (Studio hook) ·
`nodeGraphCompiler` (Studio lib) · `CodebaseSceneCompiler` (Absorb visualization).

### 3.6 DEAD/POC (2) — delete

`HoloGramMLSCompiler` (real-estate MLS gallery; not exported in main index; no consumer) ·
`MatterpakCompiler` (Matterport vendor bridge; not exported; research-only, 2026-05-10).

---

## 4. Reconciliation with the Trait-Parity Backlog

The apex-poison kill-list (§3.1) and the native-runtime trait backlog (companion doc §4) are **the
same work seen twice**:

- The companion doc found **79 traits** the R3F path emits with no native runtime handler (~50 real
  blockers + ~12 no-ops after triage), and **22 parity-OK**.
- Retiring `R3FCompiler` (and the other 8 apex-poison web compilers) is *only safe once those
  ~50 handlers exist in `holo-composition-executor`/`BrowserRuntime`* and a CI parity gate proves
  every R3F-emitted trait has a native handler or an explicit no-op.

So the sequencing from the companion doc governs this capstone's kill action: **close native
trait parity → flip the CI gate green → then delete §3.1.** The other buckets (export quarantine,
dead deletion, format keep) are independent and can proceed in parallel.

---

## 5. Governance — fence the escape hatches

Deletion handles §3.1 and §3.6. The 18 ESCAPE-HATCH-EXPORT compilers stay, but need a boundary so
they stop functioning as agent defection paths:

1. **Fire-and-forget contract.** Export output is a terminal artifact (like a `.pdf`): never
   round-tripped, never re-imported, never hand-edited.
2. **Agents never debug export output.** If a Unity/Unreal/Swift export is wrong, the fix goes in
   the `.holo` source + the compiler, never in the emitted C#/C++/Swift.
3. **Hierarchy enforcement.** Author order is `.holo → .hsplus → .hs`, with `.ts` only when the
   HoloScript codebase cannot support the need — and that `.ts` is *authored bridge/tooling code*,
   never *edited compiler output*. A lint/CI signal should distinguish "authored `.ts`" from
   "touched `@generated` output."
4. **NextJS render caveat.** `NextJSCompiler`'s render path wraps `Native2DCompiler` (apex-poison);
   only its API/server role is a clean escape-hatch.

---

## 6. Proposed Board Tasks

1. `chore(compiler): delete DEAD/POC compilers (HoloGramMLS, Matterpak)` — §3.6. Cheap, immediate.
2. `ci: lint distinguishing authored .ts from edited @generated output` — §5.3. Enforces hierarchy.
3. `docs: escape-hatch export contract (fire-and-forget, no round-trip)` — §5.1–5.2.
4. `feat(runtime): close native trait-parity backlog` — companion doc §4 (the real engineering).
5. `ci: parity gate — every apex-poison-emitted trait has a native handler/no-op` — gates #6.
6. `chore(compiler): retire 9 apex-poison web compilers once parity gate green` — §3.1.
7. `refactor(NextJS): sever render path from Native2DCompiler` — §5.4.
8. `audit: confirm GPU-lowering compilers are internal-only (no hand-edited WGSL source)` — §3.4.

---

## 7. What Remains After This Plan (honest gap)

This capstone classifies the compiler matrix and sequences the cleanup. It explicitly does **not**:

- **Make HoloLand a AAA MMO.** Server authority, MMO-scale netcode, a running backend, the AAA
  rendering ceiling, and actual game content are all out of scope here (see the readiness scorecard
  in the companion doc).
- **Implement the native trait handlers.** The kill action depends on board task #4, which is the
  larger engineering effort, not done here.
- **Verify runnability.** Live/dead and runtime-overlap calls use exports + tests + grep as proxies;
  no compiler was executed to confirm its output runs. Confidence ≈ 90%.
- **Resolve every edge case.** `VRChatCompiler` is flagged overclaimed (bytecode-gated);
  `NextJSCompiler` straddles two buckets; a few SAFE-FORMAT compilers lack tests and may be
  partially aspirational. These need per-file follow-up before deletion of anything beyond §3.6.
- **Settle token-economy empirically.** The "reduces tokens for some not all" thesis is argued from
  target verbosity, not measured. A real measurement (tokens to author `.holo` vs. tokens to author
  the target directly, per bucket) would harden the value axis — worth a follow-up experiment.

One-line summary: *the compiler matrix is mostly healthy — 16 safe formats + 14 internal + 5
GPU-lowering are keepers and several are HoloScript's best token-economy wins — but 9 apex-poison
web compilers must fold into the native runtime, 2 dead ones deleted, and 18 exports fenced so they
stop training agents to leave HoloScript.*

---

## 8. Provenance & Confidence

- **Method:** enumerated all 64 `*Compiler.ts` (excluding tests/node_modules) via `find`; read each
  file's header/exports/emit logic; grepped consumers (`core/src/compiler/index.ts` exports,
  `mcp-server`, `studio`, CLI, test files); classified against the §2 model.
- **Bucket counts** were recounted from the per-file table (the source scan's summary had minor
  arithmetic drift): APEX-POISON 9 · ESCAPE-HATCH 18 · SAFE-FORMAT 16 · GPU-LOWERING 5 ·
  INTERNAL-INFRA 14 · DEAD/POC 2 = 64.
- **Verified:** file existence, exports, target language, LOC, test presence.
- **Inferred (≈90%):** Q1 lang-gravity (from headers/targets, no fluency test), Q3 runtime-overlap
  (from "emits JS/TS client scene-graph" heuristic), live/dead (tests + callers as proxy).
- **Not verified:** that any compiler's output actually runs; live MCP/codebase-intelligence tools
  (`mcp.holoscript.net` unreachable from sandbox) — all evidence is static source reading.
