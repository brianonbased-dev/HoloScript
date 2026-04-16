# Execution Governance: Film3 XR Grounding Sprint

This artifact dictates the **10–14 day** authorization sequence dedicated to systematically eliminating the blocking XR primitives required to pull the Sovereign Mesh out of the desktop browser and physically ground it into **Android XR** standalone devices (Meta Quest 3).

**Implementation status (repo):**

- **Manifest gate (Ticket 1 risk):** `AndroidXRCompiler` emits  
  `<uses-feature android:name="android.hardware.camera.ar" android:required="false" />`  
  when `useARCore` is on and the composition uses `occlusion_mesh`, `environment_probe`, or `spatial_awareness`. Set compiler option `arCameraHardwareRequired: true` for Quest-only / hard AR-hardware builds (`required="true"`).
- **Trait codegen:** `AndroidXRTraitMap.ts` already maps `occlusion_mesh`, `environment_probe`, and `gaze_interactable` per the sprint skeletons below—verify against live ARCore / SceneCore APIs during the sprint.

## Sprint Architecture (Target Merge: ~May 5, 2026)

### Ticket 1: Depth Occlusion & Environmental Probing

- **Branch Name:** `feature/xr-primitives-film3-batch1` (Base: `main`)
- **Owner:** @claude-XR (Target: 40 person-hours)
- **Top 2 Focus Items:** `occlusion_mesh` and `environment_probe` mapping.
- **Success Criteria:** Anchored OpenUSD exports correctly occlude behind physical soundstage infrastructure (light stands) using raw ARCore Depth nodes, and materials auto-evaluate HDR spherical harmonics.

**Git Diff Skeleton (`packages/core/src/compiler/AndroidXRTraitMap.ts`):**

```diff
    occlusion_mesh: {
      trait: 'occlusion_mesh',
      level: 'full',
      imports: ['com.google.ar.core.Config', 'androidx.xr.scenegraph.PerceptionSpace'],
      generate: (varName) => [
-       `// TODO: integrate ARCore Depth API for occlusion`
+       `// Activate strictly if depth API is physically supported on-device`
+       `if (xrSession.isDepthSupported()) {`
+       `    xrSession.scene.configure { config -> config.depthMode = Config.DepthMode.AUTOMATIC }`
+       `    ${varName}.enableDepthOcclusion(true)`
+       `}`
      ]
    },
    environment_probe: {
      trait: 'environment_probe',
+     generate: (varName) => [
+       `// Attach HDR environmental projection to scene root`
+       `val ${varName}Probe = xrSession.scene.perceptionSpace.createEnvironmentProbe()`
+       `sceneRoot.addComponent(${varName}Probe)`
+     ]
    }
```

### Ticket 2: Gaze & Hand Raycast Fusion (No-Controller Interaction)

- **Branch Name:** `feature/xr-gaze-hand-fusion` (Base: `main`)
- **Owner:** @claude-XR

**Git Diff Skeleton:**

```diff
    gaze_interactable: {
      generate: (varName) => [
-       `// TODO: map headset gaze vector and pinch gesture`
+       `// Combine Android SceneCore Gaze entity with Hand tracking pinch`
+       `${varName}.addComponent(InteractableComponent(InteractableType.GAZE_AND_PINCH))`
+       `${varName}.setOnClickListener { event -> handleUaalEvent(event) }`
      ]
    }
```

**Test Scene Integration (`packages/studio/src/__tests__/scenarios/film3-xr-anchors.scenario.ts`):**

Host-side **vitest** contract: depth-disabled path skips depth configuration; when depth is supported, hologram behind a depth wall is dropped from painter order while UI remains last (overlay). Run: `pnpm exec vitest run src/__tests__/scenarios/film3-xr-anchors.scenario.ts` from `packages/studio`. Quest walk-through still required for real ARCore meshes.

**CI / local verification commands (post-merge):**

```bash
cd packages/core
pnpm exec vitest run src/compiler/__tests__/AndroidXRCompiler.test.ts
pnpm exec vitest run src/compiler/__tests__/AndroidXRTraitMap.test.ts
```

Quest 3: build generated Android project, sideload APK, confirm no crash when `Session` resumes and depth is unsupported (guard paths + manifest).

---

## Brutally Honest: End-to-End Reality

After merging this XR sprint on top of existing CRDT wins, what can you actually do?

**CAN DO:** You can take an OpenUSD pre-viz scene built in HoloScript Studio, deploy it to a Meta Quest 3, and physically walk a camera rig around holograms that will *correctly* cast shadows based on actual soundstage lights, and *correctly* hide behind physical light stands. Pre-viz feels “physically grounded.”

**STILL MISSING:** Deterministic chronological syncing. If you hit “Play” on a timeline sequence, the actor traversing the room can drift between directors. If you try to green-screen composite with Unreal’s LiveLink, HoloScript has **no deterministic gen-lock bridges** to sync XR frame buffers with physical Red camera shutters—that remains an Unreal Engine monopoly for typical on-set pipelines.

---

## Alternative Path: Expand CRDT

If we abandon the XR sprint immediately to harden backpressure 60fps buffers for scale:

- **Minimal change:** migrating `DedicatedSignalingBuffer` into a decoupled microservice orchestrator parallel to Railway, plus strict 2MB binary compression chunking on Yjs fragments.
- **XR route impact:** XR needs physical device testing and ARCore lifecycle tracking but delivers the visual “magic” of Film3. Further CRDT/WebRTC expansion scales the **browser** experience (more simultaneous directors) but does not put anyone on a real soundstage. For a pre-viz studio, **XR grounding usually wins** over raw scale.

---

## Agent Critique & Validation

- **@claude-XR:** Deploying ARCore Depth automatically requires enforcing `<uses-feature android.hardware.camera.ar />` in the builder target manifest. If that build step is not automated alongside Ticket 1, headsets can misbehave or store filters can mismatch capabilities. **Addressed in `AndroidXRCompiler.generateManifestFile` + `arCameraHardwareRequired` option.**
- **@antigravity-core:** CRDT stability holds; returning to XR targets prevents mobile/headset compiler output from lagging WebGPU so far that convergence becomes impossible. **Authorize the XR batch** at narrowed scope (Tickets 1–2), then Quest walk-through before expanding trait surface.
