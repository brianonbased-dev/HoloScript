# Roadmap — HoloScript language → "Byte" (VRChat Udon)

> Research + roadmap, 2026-06-22. Author: claude (full-surface agent).
> Scope: the **emit** direction, `.holo`/`.hsplus` → runnable VRChat **world** content.
> D.101 check: a compile **target** is language work → this roadmap is freeze-compatible.
> D.104 check: VRChat traits must land in `.hsplus`, not grow as TS (Phase 4).

---

## 0. The naming correction (read first)

There is **no VRChat product called "Byte."** The term in `outputFormat: 'udon-bytecode'`,
`docs/compilers/vrchat-byte-target.md`, and founder direction **D.064 (2026-05-24)** is our
*internal* name for the **Udon bytecode** target. The real-world surface is:

| Surface | What it is | Status (2026-06) | Relevance to us |
|---|---|---|---|
| **Udon** | VRChat's world VM. Runs **bytecode** assembled from **Udon Assembly (UASM)**. | Live, current | **This is "Byte."** The Udon-bytecode target = our goal. |
| **UdonSharp** | Community C#→Udon compiler (Unity-side). | Live, what we emit today | Our current path; D.064 wants to move *off* it. |
| **Udon 2** | Abandoned successor working-title. | **Dead** (dropped Nov 25 2024) | Do not target. |
| **Soba** | Official Udon successor. High-level OOP **C# 9.0** editor, usable *alongside* Udon. | **Closed beta prep** as of Mar 2026; "actively worked on" per May 22 2026 dev stream; **no release date** | Future retarget (Phase 5). Not buildable now. |

**Avatars are out of scope for "Byte."** VRChat avatars do **not** run Udon — they use
animator/expression params + PhysBones. `examples/avatars/vrchat-avatar.holo` is a *separate*
FBX-descriptor bridge, not part of this roadmap. Calling that out because the existing example
invites the conflation.

---

## 1. The architectural truth that bounds everything

**VRChat's publish pipeline is a closed Unity loop and cannot be made sovereign.**

- Worlds ship as **Unity AssetBundles** built by the **VRChat SDK**.
- The Unity version must match VRChat's **exactly** (patch + suffix) or upload is refused.
- There is **no official headless / external world upload.** The terminal step
  (AssetBundle build + control-panel upload) always runs inside Unity.

**Consequence:** HoloScript can never own the *runnable* VRChat world end-to-end. VRChat is
correctly classified **BRIDGE** (`sovereign-targets.ts:54`; W.GOLD.002 / W.GOLD.012). The roadmap's
ambition is therefore **maximize fidelity and minimize the manual Unity step** — not eliminate it.

What we *can* own offline (the sovereignty we actually have within the bridge):
1. **`.holo`/`.hsplus` → Udon Assembly** codegen (no Unity, no UdonSharp dependency).
2. **Offline verification** — UASM grammar validation + EXTERN-signature resolution against a
   snapshot of VRChat's exposed Udon node registry. (Gate-enforced, not asserted.)
3. **A project bundle** that pre-wires the scene/UdonBehaviour graph so the human's Unity step
   collapses to "open → Build & Publish."

The irreducible manual step is one Unity build+upload. Everything before it is ours.

---

## 2. Current state (verified 2026-06-22)

| Component | Path | State |
|---|---|---|
| MCP tool | `packages/mcp-server/src/compiler-tools.ts:1288` | `compile_to_vrchat`, routes to `target:'vrchat'` |
| Compiler | `packages/core/src/compiler/VRChatCompiler.ts` (833 LOC) | Emits **UdonSharp C#** (production) |
| Gate | `VRChatCompiler.ts:163-180` | `udon-assembly` / `udon-bytecode` **fail fast** (D.064 honesty guard) |
| Registry | `ExportManager.ts:244` | Registered; BRIDGE; budget `['quest3','desktop_vr']` |
| Tests | `VRChatCompiler.test.ts`, `.prod.test.ts`, `compiler-tools-vrchat-options.test.ts` | Unit + gate-rejection coverage; **no E2E to a real world** |
| Docs | `docs/compilers/vrchat.md`, `vrchat-byte-target.md`, `integrations/vrchat-holoscript-bridge.md` | Good; contract still "pending" |
| Examples | `examples/specialized/vrchat/social-hub-world.holo` (500+ LOC) | Comprehensive input fixture |

**Trait → Udon mapping already proven (in the C# emitter), reusable for UASM:**

| `.holo` trait | Udon event | VRChat SDK3 component |
|---|---|---|
| `@grabbable` | `OnPickup` / `OnDrop` | `VRC_Pickup` |
| `@pointable`/`@clickable` | `Interact` | `VRC_Interactable` |
| `@networked`/`@synced` | `OnDeserialization` + `RequestSerialization` | `VRC_ObjectSync` + `[UdonSynced]` |
| `@portal` | teleport | `VRC_PortalMarker` |
| `@mirror` | mirror plane | `VRC_Mirror` |
| `state{}` | synced heap vars | `[UdonSynced]` fields |
| `zones{}` | trigger enter/exit | collider callbacks |

The semantic mapping is the hard-won part and it **already exists**. The Byte work is re-lowering
it from "C# the UdonSharp compiler ingests" to "UASM the Udon assembler ingests directly."

---

## 3. The gate-opening decision (D.064's "pending contract")

D.064 froze all non-C# emission until the **artifact contract** is chosen among three options.
Selecting among recorded engineering options is an architecture call (agent-decided per §0 — not a
founder-review class). **Recommendation for the contract:**

> **Canonical output = Udon Assembly text (`.uasm`) per UdonBehaviour, plus a project-bundle
> wrapper (`.unitypackage`-shaped) carrying the scene graph + program-asset references.**

Rationale:
- `.uasm` is the **true bytecode-adjacent artifact** — it's what the Udon assembler consumes; it
  is the most direct "Byte" target and **drops the UdonSharp third-party dependency** (more
  sovereign within the bridge).
- It is **offline-verifiable** (grammar + EXTERN resolution) → satisfies "gate-enforced, not
  asserted."
- A raw `.uasm` alone is *useless to a human* without scene wiring → the bundle wrapper is what
  makes the artifact actually shippable and collapses the manual Unity step. This is option 3 in
  `vrchat-byte-target.md`, and it composes with option 1 rather than competing.

Rejected: serialized binary program asset as canonical (option 2) — it's Unity-version-coupled,
opaque, and not human-inspectable; emit it *from* `.uasm` inside the Unity CI step instead.

This decision is the content of **Phase 0**. Until the result type and filenames encode it, no
non-C# bytes get emitted (the existing guard stays correct).

---

## 4. Roadmap

Six tracks. Phases 0–3 open and prove the Byte path; 4 makes it native; 5 is the Soba hedge; X is
the always-running cross-cutting reality.

### Phase 0 — Encode the contract (gate-opener) · S
*Goal: make the artifact contract explicit so the guard can open.*
- Extend `VRChatCompileResult` with a typed `udonAssembly: Map<behaviour, string>` + `bundle`
  manifest shape. Define output filenames (`*.uasm`, `bundle.json`).
- Replace the blanket fail-fast with: `udon-assembly` allowed once a validator exists (Phase 1
  dependency); `udon-bytecode` still gated (it's a Unity-side derivative).
- Update `vrchat-byte-target.md` from "pending" → "selected: .uasm + bundle."
- **Gate:** result type + fixtures compile; docs reflect the decision; guard logic unit-tested.

### Phase 1 — Offline Udon ground truth · M
*Goal: a verifiable target before any codegen. Build the ruler before the thing you measure.*
- **EXTERN node manifest:** snapshot VRChat's exposed Udon node registry (the full set of valid
  `EXTERN` signatures, e.g. `UnityEngineGameObject.__SetActive__SystemBoolean__SystemVoid`) into a
  versioned JSON keyed by SDK version. This is the single most leverage-dense asset in the plan —
  every codegen correctness check depends on it.
- **UASM grammar + validator:** `.data_start/.data_end` (typed heap vars + initial values),
  `.code_start/.code_end`, opcodes (`NOP PUSH POP JUMP JUMP_IF_FALSE EXTERN JUMP_INDIRECT COPY
  ANNOTATION`). Validate structure + that every `EXTERN` resolves against the manifest.
- **Golden fixtures:** hand-write minimal UASM for one cube-with-toggle world; lock as the
  conformance reference.
- **Gate:** validator passes hand-written fixtures; flags a deliberately-broken EXTERN.

### Phase 2 — Core codegen: `.holo` → UASM · L
*Goal: emit valid Udon Assembly for the trait subset the C# path already covers.*
- Lower `composition.state` → `.data` heap; lifecycle (`Start`, `OnPlayerJoined`,
  `OnDeserialization`) + the §2 trait events → `.code`; resolve every call to an EXTERN signature
  via the Phase-1 manifest.
- Control-flow lowering (the real work): if/branch → `JUMP_IF_FALSE`; loops → `JUMP`; event entry
  points → exported addresses; sync → `RequestSerialization` EXTERN.
- Start with `@grabbable @clickable @networked @portal @mirror` + zones; defer timelines/
  transitions/domain-blocks to Phase 4.
- **Gate:** emitted UASM for `social-hub-world.holo` (reduced) passes the Phase-1 validator with
  100% EXTERN resolution; snapshot-tested against golden output.

### Phase 3 — Bundle wrapper + Unity round-trip CI · L
*Goal: close the loop to a real, uploadable world and prove it once.*
- Emit the project bundle: scene + `UdonBehaviour` prefab graph + `.uasm` program-asset refs +
  VRChat SDK manifest, so the human step is "open → Build & Publish."
- **Headless Unity-batch CI job** (the gold-standard verification): pinned VRChat Unity version,
  VRChat SDK, assemble the `.uasm` via the Udon assembler, confirm the program loads and the world
  builds. This is heavy (GPU/runner) → schedule on fleet, not the daily driver.
- **Gate:** one HoloScript example builds in the Unity SDK and uploads to a private test world
  (manual upload acceptable — that's the irreducible step from §1). Capture a receipt + screenshot.

### Phase 4 — Native authoring + breadth (D.104) · M, ongoing
*Goal: the VRChat target dissolves TS into `.hsplus`, and coverage widens.*
- Move VRChat trait definitions into **`.hsplus`** (handler-objects, `capability_tags`,
  `@state_machine`) — not new TS. Raise native-authored fraction; do not regress
  `check:native-coverage` (G7).
- Expand UASM codegen to timelines, transitions, and domain blocks (materials/physics/audio).
- **Gate:** native-coverage non-regressing; trait set authored declaratively; new traits ship with
  golden UASM fixtures.

### Phase 5 — Soba hedge (watch + spike) · S, parallel
*Goal: be ready to flip to the official future the day beta opens.*
- Soba is **C# 9.0** and *closer to our current emitter* than UASM is. Maintain a thin spike that
  retargets the existing UdonSharp-C# emitter to Soba's supported subset (classes/interfaces/
  structs/pattern-matching; **no generics/delegates/LINQ** yet).
- Track Soba beta access; do **not** invest heavily until access lands.
- **Gate (deferred):** on beta access, the spike compiles the minimal world in Soba.

### Track X — Cross-cutting reality (always on)
- **Manifest staleness:** EXTERN signatures change per SDK release → version the manifest, CI-check
  drift, fail loud when a target SDK version has no manifest.
- **Unity-version lock:** pin and surface the exact required Unity version in bundle output; mismatch
  is the #1 community upload failure.
- **Ingest direction** (`hs import-vrchat`, VRChat→`.holo`, bridge doc §1) is a *separate* track —
  noted, not in this emit roadmap. Verify whether the documented CLI is real before citing it.

---

## 5. Sequencing & the critical path

```
Phase 0 (encode contract) ─► Phase 1 (validator + EXTERN manifest) ─► Phase 2 (UASM codegen)
                                                                          │
                                              Phase 3 (bundle + Unity CI) ◄┘ ─► Phase 4 (native + breadth)
Phase 5 (Soba spike) … parallel, low-priority until beta access
Track X … continuous
```

**Critical path = 0 → 1 → 2 → 3.** Phase 1's EXTERN manifest is the long pole: without it, every
codegen "correctness" claim is unverifiable and we'd be back to the overclaim D.064 exists to
prevent. Build the ruler first.

**Smallest valuable slice (de-risk before committing the full L phases):** Phase 0 + a *reduced*
Phase 1 (validator for one opcode subset + a 20-node EXTERN manifest) + Phase 2 for `@clickable`
only → emit valid UASM for "click cube → toggle active," validated offline. That single vertical
proves the whole approach with no Unity dependency, and is the recommended first claim.

---

## 6. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Closed publish pipeline — last mile never leaves Unity | **Structural** | Accept it; bundle-wrapper minimizes the step; stay BRIDGE |
| EXTERN API churn across SDK versions | High | Versioned manifest + CI drift gate (Track X) |
| Unity-version exact-match upload failures | High | Pin + surface required version in bundle |
| Re-implementing UdonSharp's compiler surface is large | High | Scope to the proven trait subset first (Phase 2); golden fixtures bound it |
| Soba lands and obsoletes the UASM path | Medium | Phase 5 spike keeps the C#-emitter retargetable; UASM still valid until Soba GA |
| Overclaiming "Byte" while emitting C# | Medium | Existing guard + Phase-0 typed result keep honesty |
| D.064 contract reopened by founder | Low | Phase 0 is cheap to redo; nothing downstream ships until it's set |

---

## 7. Recommendation

1. **Adopt the artifact contract** (§3): `.uasm` canonical + project bundle. Open the gate.
2. **Claim the smallest vertical slice** (§5): one EXTERN, one trait, offline-validated UASM — proves
   the approach with zero Unity dependency and converts D.064 from "gated" to "moving."
3. **Treat VRChat as a permanent BRIDGE** — pour the *sovereign* effort into offline codegen +
   verification (ours forever), accept the one Unity build step (theirs forever).
4. **Run the Soba spike in the background** so the official-future flip is cheap when beta opens.

The work is real, freeze-legal (it's a compiler target), and bounded by an honest verification gate.
The first claim is Phase 0 + the §5 vertical slice.

---

### Sources
- [Udon — VRChat Wiki](https://wiki.vrchat.com/wiki/Udon)
- [Soba — VRChat Wiki](https://wiki.vrchat.com/wiki/Soba)
- [Udon — VRChat Creation docs](https://creators.vrchat.com/worlds/udon/)
- [Getting Started — VRChat Creation (SDK/Unity requirement)](https://creators.vrchat.com/sdk/)
- Internal: `docs/compilers/vrchat-byte-target.md` (D.064), `VRChatCompiler.ts`, `sovereign-targets.ts`
