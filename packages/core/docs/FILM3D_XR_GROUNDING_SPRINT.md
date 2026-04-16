# Execution Governance: Film3D XR Grounding Sprint

This artifact dictates the **10–14 day** authorization sequence dedicated to systematically eliminating the blocking XR primitives required to pull the Sovereign Mesh out of the desktop browser and physically ground it into **Android XR** standalone devices (Meta Quest 3).

---

## Post-manifest reality (main — refresh verification after pull)

| Item | Status |
|------|--------|
| **Manifest gate** | Landed **`1c0ac8db`** — `AndroidXRCompiler` emits `<uses-feature android:name="android.hardware.camera.ar" android:required="false|true"/>` when `useARCore` and composition uses `occlusion_mesh`, `environment_probe`, or `spatial_awareness`; option `arCameraHardwareRequired`. |
| **Studio contract tests** | **`a2904bee`** — `packages/studio/src/__tests__/scenarios/film3d-xr-anchors.scenario.ts` (painter-order + depth guard). |
| **Follow-on** | Repo may advance past these (e.g. native bindings work); re-run **Self-verification** below after every pull. |

### `AndroidXRTraitMap.ts` TODO inventory

- **PowerShell (verbatim):**  
  `Select-String -Path "...\AndroidXRTraitMap.ts" -Pattern "TODO" \| Measure-Object` → **`16`** matches.
- **Interpretation:** **15** lines are `// TODO:` stubs inside generated Kotlin strings (depth fusion, ML, etc.). **1** match is the English phrase in `TraitImplementationLevel` (`'partial' // Generates some code with TODOs`). Treat **15** as “remaining codegen placeholders,” **16** as raw grep count.

### Compiler tests (refresh)

```text
pnpm exec vitest run src/compiler/__tests__/AndroidXRCompiler.test.ts
 Test Files  1 passed (1)
      Tests  44 passed (44)
```

### Film3D opcode coverage (Studio scenarios)

**PowerShell (verbatim):**

```text
=== film3d-previz.scenario.ts ===
  opCode 1 (PUSH), 0xB1 (OP_RENDER_HOLOGRAM), 255 (HALT) — see file for full lines.
=== film3d-xr-anchors.scenario.ts ===
  (no UAAL opcodes — policy/painter contract only; pair with previz for stack coverage)
```

**Coverage note:** `film3d-previz.scenario.ts` exercises **3** opcodes (`1`, `0xB1`, `255`). `film3d-xr-anchors.scenario.ts` adds **0** opcodes; end-to-end Film3D still needs more opcode paths for splat scrub / timeline (future).

---

## Trait skeletons — exact locations (`AndroidXRTraitMap.ts`)

Citations use current file layout; line numbers drift with edits — search by trait key if needed.

### `gaze_interactable` (UI / spatial)

```1727:1737:packages/core/src/compiler/AndroidXRTraitMap.ts
  gaze_interactable: {
    trait: 'gaze_interactable',
    components: ['InteractableComponent'],
    level: 'full',
    imports: ['androidx.xr.scenecore.InteractableComponent', 'androidx.xr.scenecore.InteractableType'],
    generate: (varName) => [
      `// Combine Android SceneCore Gaze entity with Hand tracking pinch`,
      `${varName}.addComponent(InteractableComponent(InteractableType.GAZE_AND_PINCH))`,
      `${varName}.setOnClickListener { event -> handleUaalEvent(event) }`,
    ],
  },
```

### `occlusion_mesh` (environment / depth)

```1854:1866:packages/core/src/compiler/AndroidXRTraitMap.ts
  occlusion_mesh: {
    trait: 'occlusion_mesh',
    components: [],
    level: 'full',
    imports: ['com.google.ar.core.Config', 'androidx.xr.scenegraph.PerceptionSpace'],
    generate: (varName) => [
      `// Activate strictly if depth API is physically supported on-device`,
      `if (xrSession.isDepthSupported) {`,
      `    xrSession.scene.configure { config -> config.depthMode = Config.DepthMode.AUTOMATIC }`,
      `    ${varName}.enableDepthOcclusion(true)`,
      `}`,
    ],
  },
```

### `environment_probe`

```1868:1877:packages/core/src/compiler/AndroidXRTraitMap.ts
  environment_probe: {
    trait: 'environment_probe',
    components: [],
    level: 'full',
    generate: (varName) => [
      `// Attach HDR environmental projection to scene root`,
      `val ${varName}Probe = xrSession.scene.perceptionSpace.createEnvironmentProbe()`,
      `sceneRoot.addComponent(${varName}Probe)`,
    ],
  },
```

### Minimal extra work for basic on-device behavior (honest)

These strings are **compiler-shaped stubs**, not drop-in Jetpack XR / ARCore calls. For **basic** Quest validation you still need:

| Trait | Gap | Typical real APIs / steps |
|-------|-----|---------------------------|
| **occlusion_mesh** | Wire **ARCore `Session`**, **`Config.setDepthMode`** / frame **depth images**, feed **Filament/SceneCore** occlusion mesh or depth test — not only `xrSession.isDepthSupported`. | `Session.configure(config)`, `Frame.acquireDepthImage16Bits()` (API-level dependent), sync with render thread. |
| **environment_probe** | **`createEnvironmentProbe()`** on **`PerceptionSpace`** must match shipping SceneCore; may need **probe texture readback → Filament IBL / indirect light**. | Confirm method names against your Jetpack XR + Filament bridge version. |
| **gaze_interactable** | **`InteractableType.GAZE_AND_PINCH`** and **`setOnClickListener`** must match real SceneCore API; wire **`handleUaalEvent`** to your UAAL / Film3D bridge. | Ensure **hand + gaze** subscriptions are active and **null-safe** if tracking is off. |

**ARCore lifecycle (must-have):** resume/pause `Session` with `Activity` lifecycle; never read depth after pause; guard **null** `Frame` / session.

---

## Minimal Film3D test scene (narrative + code)

**Code:** `FILM3D_XR_MINIMAL_TEST_SCENE` in `packages/studio/src/__tests__/scenarios/film3d-xr-anchors.scenario.ts` — three objects: `occlusion_mesh`, `environment_probe`, `gaze_interactable`.

**Composition:** In `.holo`, mirror that structure: one occluder entity, one probe entity, one panel with `gaze_interactable`. Compile with **`AndroidXRCompiler`** (`useARCore: true`; set `arCameraHardwareRequired` per store vs sideload policy).

---

## On-device verification — commands (Quest 3 / device)

> HoloScript does not ship a one-click Quest pipeline in-repo; you compile **generated** Android sources, then use standard Android tooling.

1. **Produce outputs** — From your integration (CLI, Studio export, or test harness): get `AndroidXRCompiler.compile(...)` result (`activityFile`, `manifestFile`, `build.gradle`, etc.) and materialize a valid Gradle project (same package/namespace as generated).
2. **Build debug APK** (from generated project root):

```bash
./gradlew :app:assembleDebug
```

3. **Sideload** (USB debugging on Quest):

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

4. **Run** — Launch the generated activity on device; validate no crash on cold start when depth is unsupported (guards), and when depth is supported, walk the soundstage.

**Emulator:** Android XR / API 35+ emulator **may** run parts of the stack; **depth + Quest-specific paths are not a substitute** for Quest 3 — use emulator for compile/smoke only.

**CI mirror:** `pnpm exec vitest run src/compiler/__tests__/AndroidXRCompiler.test.ts` (expect **44/44**).

---

## Success criteria (next narrow ticket — on-device)

| # | Criterion |
|---|-----------|
| 1 | **Hologram** is **occluded** by real-world / depth mesh on Quest 3 (not just painter stub in tests). |
| 2 | **environment_probe** visibly changes **lighting / IBL** (even rough HDR response). |
| 3 | **gaze_interactable** responds to **gaze + pinch** without **NullRef** when tracking is partial. |
| 4 | Cold start: **no crash** if `isDepthSupported` is false (guard + manifest optional `required="false"`). |
| 5 | **OpenUSD export** (your Film3D path) includes **anchored bounds** consistent with stage — **fidelity** may still lag DCC tools (see below). |

---

## Brutally honest: Film3D end-to-end pre-viz (after these three traits + CRDT/WebRTC + hologram + manifest)

**You can run:** Studio (or pipeline) → **compile Android XR** → **sideload Quest 3** → **walk soundstage** → see **grounded, occludable hologram** with **HDR-ish lighting response** and **director-grade gaze/pinch** on a panel — then **export OpenUSD** from your existing Film3D exporter **if** that exporter consumes the same scene graph (often **partial**; verify bindings).

**Rough coverage vs a full physical soundstage pre-viz pipeline (Unreal/Unity + gen-lock):** **~35–45%** of “production” pre-viz **if** you measure *blocking, occlusion-aware placement + director interaction + collaboration*. **~15–25%** if you measure *final pixel fidelity + lockstep multi-user body sync + camera gen-lock*.

**Still forces Unreal/Unity / external tools for:**

- **Gen-lock / frame-accurate scrub** with physical **Red** shutters and **LiveLink-class** lockstep.
- **Final occlusion / GI fidelity** at film quality (path-traced, calibrated stages).
- **Multi-user physical sync** with **sub-frame** agreement (actors, props) — CRDT/WebRTC helps collaboration, not cinema gen-lock.
- **VFX-final** comp — HoloScript is **previz-first**, not a full comp finish line.

---

## OpenUSD export fidelity — concerns

- Exporters often **lose** runtime **ARCore depth** nuance; rebake **bounds** and **materials** explicitly.
- **Validation:** diff USD against ground-truth stage measurements (tape measure / lidar) on a **single** hero shot before trusting scale.

---

## Cross-agent review (MCP pool / XR specialists)

| Concern | Severity | Mitigation |
|--------|----------|------------|
| **ARCore Session** lifecycle vs Compose/XR activity | High | Single owner thread; pause/resume with `Activity`; no depth after pause. |
| **Manifest** `camera.ar` | Medium | Automated in compiler; **optional** `required` flag for sideload vs store. |
| **API name drift** (`createEnvironmentProbe`, `isDepthSupported`) | Medium | Pin **Jetpack XR / SceneCore** versions; integration tests on device. |
| **Kotlin stubs** vs real **SceneCore** | High | Treat compiler output as **starting point** until device-green. |

**Authorize next narrow ticket?** **Yes — on-device hardening only** for `occlusion_mesh`, `environment_probe`, `gaze_interactable` (no scope creep to ML TODOs at lines 2470+ until Film3D path is green).

---

## Sprint Architecture (Target Merge: ~May 5, 2026)

### Ticket 1: Depth Occlusion & Environmental Probing

- **Branch Name:** `feature/xr-primitives-film3d-batch1` (Base: `main`)
- **Owner:** @claude-XR (Target: 40 person-hours)
- **Top 2 Focus Items:** `occlusion_mesh` and `environment_probe` mapping.

### Ticket 2: Gaze & Hand Raycast Fusion (No-Controller Interaction)

- **Branch Name:** `feature/xr-gaze-hand-fusion` (Base: `main`)
- **Owner:** @claude-XR

**Test Scene Integration (`packages/studio/src/__tests__/scenarios/film3d-xr-anchors.scenario.ts`):**

Host-side **vitest** + `FILM3D_XR_MINIMAL_TEST_SCENE`. Run:

```bash
cd packages/studio
pnpm exec vitest run src/__tests__/scenarios/film3d-xr-anchors.scenario.ts
```

**CI / local verification commands (post-merge):**

```bash
cd packages/core
pnpm exec vitest run src/compiler/__tests__/AndroidXRCompiler.test.ts
pnpm exec vitest run src/compiler/__tests__/AndroidXRTraitMap.test.ts
```

---

## Alternative Path: Expand CRDT

If we abandon the XR sprint immediately to harden backpressure 60fps buffers for scale:

- **Minimal change:** migrating `DedicatedSignalingBuffer` into a decoupled microservice orchestrator parallel to Railway, plus strict 2MB binary compression chunking on Yjs fragments.
- **XR route impact:** XR needs physical device testing and ARCore lifecycle tracking but delivers the visual “magic” of Film3D. Further CRDT/WebRTC expansion scales the **browser** experience (more simultaneous directors) but does not put anyone on a real soundstage. For a pre-viz studio, **XR grounding usually wins** over raw scale.

---

## Agent Critique & Validation

- **@claude-XR:** Manifest automation for `camera.ar` is in **`AndroidXRCompiler`** — validate on **Quest sideload + Play-internal** builds separately.
- **@antigravity-core:** Authorize **narrow** on-device tickets; do not expand to ML/TFLite TODO block until Film3D depth+gaze+probe are green.
