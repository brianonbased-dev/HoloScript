# HoloScript-to-HoloLand Package Migration Audit Report

**Date:** 2026-05-12
**Auditor:** claude1 (claudecode-claude-x402)
**Scope:** HoloScript repo (`C:\Users\Josep\Documents\GitHub\HoloScript`) vs. HoloLand repo (`C:\Users\Josep\Documents\GitHub\HoloLand`)
**Task:** task_1778615038574_08f3 — Verify HoloScript-to-HoloLand package migration paths and flag stale references

---

## 1. HoloLand-Specific Packages / Code Still in HoloScript

### 1.1 `packages/hololand-platform/` — `@holoscript/hololand-platform`
- **Package name:** `@holoscript/hololand-platform` (version `6.0.5`)
- **Description:** "Hololand VR Platform Services (Affective Memory, State, etc)"
- **Source modules:**
  - `src/world/frontier-shard-zero.ts` — bootstrap shard for HoloLand
  - `src/world/byzantineWorldConsensus.ts` — Byzantine consensus for world creation
  - `src/world/causal.ts` — causal world model / VR physics model
  - `src/creator/kiosk.ts` + `template-pipeline.ts` — creator challenge/kiosk pipeline
  - `src/device-lab/index.ts` + `cli.ts` — hardware readiness probes
  - `src/collaboration/blockoutCRDT.ts` — collaborative blockout CRDT
  - `src/memory/affective.ts` — affective memory
- **Dependencies:** `@holoscript/crdt-spatial`, `@holoscript/framework`, `@holoscript/runtime`
- **Status:** This is **HoloLand domain code** living inside the HoloScript repo. The package name prefix (`@holoscript/`) suggests it has not been migrated.

### 1.2 `packages/core/src/hololand/` — Core HoloLand Integration
- **Modules:**
  - `WorldDefinitionSchema.ts` — world definition AST/schema
  - `HololandIntegration.ts` — runtime service interfaces (assets, networking, audio, physics, input, analytics, voice, storage)
  - `StreamingProtocol.ts` — entity streaming protocol
  - `PhysicsBoundsRegistry.ts` — confabulation-safe physics bounds
  - `CrossValidationRegistry.ts` — multi-agent cross-validation / consensus
  - `ItemManifest.ts` — sovereign trait items
- **Public API exposure:** Exported via `packages/core/src/barrel/index.ts:24` (`export * from './hololand-runtime';`) and `packages/core/src/barrel/exports-semantics-diff-wasm.ts:11` (`export * as hololand from '../hololand';`).
- **Impact:** Any consumer of `@holoscript/core` receives the full HoloLand integration surface as part of the core public API.

### 1.3 `packages/runtime/src/traits/HoloLandTraits.ts`
- **Exports:** Runtime-side trait handlers for `@stat`, `@luck`, `@encounter`, `@drop_table`
- **Public exposure:** Re-exported from `packages/runtime/src/index.ts:299`
- **Status:** HoloLand-specific game trait adapters in the generic runtime.

### 1.4 `packages/react-agent-sdk/` — `@hololand/react-agent-sdk`
- **Package name:** `@hololand/react-agent-sdk` (version `0.1.1`)
- **Anomaly:** This package is **published under the `@hololand/` namespace** but physically lives in the **HoloScript repo**.
- **Repo metadata:** Repository URL points to `brianonbased-dev/HoloScript.git`, directory `packages/react-agent-sdk`.
- **Impact:** Cross-repo naming collision. If HoloLand repo ever adds its own `packages/react-agent-sdk`, this will clash.

### 1.5 `packages/framework/src/board/hololand-receipts.ts`
- **Purpose:** Domain-extension receipt types for HoloLand hardware validation, replay determinism, and agent steward actions.
- **Consumers:**
  - `packages/framework/src/board/frontier-shard.ts:30`
  - `packages/framework/src/board/creator-template.ts:37`
  - `packages/framework/src/board/agent-steward.ts:57`
  - `packages/framework/src/board/index.ts:186`
- **Status:** HoloLand-specific domain model embedded in the generic framework board layer.

### 1.6 `packages/marketplace-api/src/hololandRoutes.ts`
- **Purpose:** Express routes for HoloLand-specific services (VRR twin creation, quest generation, StoryWeaver minting).
- **Consumer:** `packages/marketplace-api/src/server.ts:15`
- **Status:** HoloLand business-logic routes in the generic marketplace API.

### 1.7 `packages/vscode-extension/docs/HOLOLAND_QUICK_START.md` + `HOLOLAND_PLATFORM_GUIDE.md`
- **Status:** HoloLand-specific documentation inside the HoloScript VSCode extension package.

---

## 2. HoloLand Repo Package Inventory

Verified packages under `C:\Users\Josep\Documents\GitHub\HoloLand\packages\`:

| Package | Path |
|---|---|
| `@hololand/base-token-viz` | `packages/base-token-viz` |
| `@hololand/components` | `packages/components` |
| `@hololand/creation-tools` | `packages/creation-tools` |
| `@hololand/playground` | `packages/playground` |
| `@hololand/spatial-builder` | `packages/spatial-builder` |
| `@hololand/traits` | `packages/traits` |
| `@hololand/accessibility` | `packages/platform/accessibility` |
| `@hololand/animation` | `packages/platform/animation` |
| `@hololand/audio` | `packages/platform/audio` |
| `@hololand/auth` | `packages/platform/auth` |
| `@hololand/core` | `packages/platform/core` |
| `@hololand/gestures` | `packages/platform/gestures` |
| `@hololand/haptics` | `packages/platform/haptics` |
| `@hololand/holofilter` | `packages/platform/holofilter` |
| `@hololand/library` | `packages/platform/library` |
| `@hololand/lod` | `packages/platform/lod` |
| `@hololand/logger` | `packages/platform/logger` |
| `@hololand/mobile` | `packages/platform/mobile` |
| `@hololand/navigation` | `packages/platform/navigation` |
| `@hololand/network` | `packages/platform/network` |
| `@hololand/pcg` | `packages/platform/pcg` |
| `@hololand/portals` | `packages/platform/portals` |
| `@hololand/quality-profiles` | `packages/platform/quality-profiles` |
| `@hololand/renderer` | `packages/platform/renderer` |
| `@hololand/services` | `packages/platform/services` |
| `@hololand/social` | `packages/platform/social` |
| `@hololand/spatial` | `packages/platform/spatial` |
| `@hololand/streaming` | `packages/platform/streaming` |
| `@hololand/three-plains` | `packages/platform/three-plains` |
| `@hololand/ui` | `packages/platform/ui` |
| `@hololand/voice` | `packages/platform/voice` |
| `@hololand/world` | `packages/platform/world` |
| `@hololand/three-adapter` | `packages/adapters/three` |
| `@hololand/react-three` | `packages/adapters/react-three` |
| `@hololand/ai-bridge` | `packages/brittney/ai-bridge` |

---

## 3. Stale / Broken References

### 3.1 Runtime Import: `@hololand/gpu` — **DOES NOT EXIST**
- **File:** `packages/engine/src/runtime/BuiltinRegistry.ts:173`
- **Code:**
  ```ts
  const { FlowFieldCompute } = await import('@hololand/gpu');
  ```
  and again at line 212:
  ```ts
  const { GPUContext } = await import('@hololand/gpu');
  ```
- **HoloLand repo:** No `packages/platform/gpu` directory. No `@hololand/gpu` package.
- **Impact:** Runtime failure when `FlowFieldCompute` or `GPUContext` builtins are instantiated. The GPU compute functionality either belongs in `@hololand/core`, `@hololand/renderer`, or needs a new package.

### 3.2 JSDoc / Package Name Mismatch: `@hololand/holoscript-linter`
- **File:** `packages/linter/src/index.ts:7`
- **Claimed name in JSDoc:** `@hololand/holoscript-linter`
- **Actual package.json name:** `@holoscript/linter` (version `7.0.0`)
- **Impact:** Documentation drift. Downstream consumers searching npm for `@hololand/holoscript-linter` will not find the package.

### 3.3 JSDoc / Package Name Mismatch: `@hololand/holoscript-formatter`
- **File:** `packages/formatter/src/index.ts:7`
- **Claimed name in JSDoc:** `@hololand/holoscript-formatter`
- **Actual package.json name:** `@holoscript/formatter` (version `3.1.0`)
- **Impact:** Same as above — documentation drift.

### 3.4 `@hololand/react-agent-sdk` Naming Anomaly
- **File:** `packages/react-agent-sdk/package.json:2`
- **Name:** `@hololand/react-agent-sdk`
- **Physical location:** HoloScript repo
- **Impact:** The package is published under HoloLand's namespace but maintained in HoloScript's repo. If HoloLand ever creates its own `react-agent-sdk`, there will be a namespace collision. This is an architectural boundary violation.

### 3.5 `@hololand/world` Externalized but Not Declared as Dependency
- **File:** `packages/runtime/tsup.config.ts:24`
- **Config:** `@hololand/world` is listed in `external` array.
- **File:** `packages/runtime/src/browser/BrowserRuntime.ts:112`
- **Comment:** `// INLINED TYPES (from @hololand/world to avoid cross-repo dependency)`
- **Status:** The runtime acknowledges the cross-repo dependency problem by inlining types. The `external` config suggests it expects the package to exist at runtime. This is a legitimate cross-repo dependency, not stale, but it signals tight coupling.

---

## 4. Equivalence Mapping: HoloScript References vs. HoloLand Reality

| HoloScript Reference | HoloLand Package Exists? | Notes |
|---|---|---|
| `@hololand/world` | Yes (`packages/platform/world`) | Legitimate cross-repo dependency |
| `@hololand/voice` | Yes (`packages/platform/voice`) | Legitimate |
| `@hololand/gestures` | Yes (`packages/platform/gestures`) | Legitimate |
| `@hololand/navigation` | Yes (`packages/platform/navigation`) | Legitimate |
| `@hololand/three-adapter` | Yes (`packages/adapters/three`) | Legitimate |
| `@hololand/react-three` | Yes (`packages/adapters/react-three`) | Legitimate |
| `@hololand/ai-bridge` | Yes (`packages/brittney/ai-bridge`) | Legitimate |
| `@hololand/gpu` | **NO** | **Stale / broken** |
| `@hololand/holoscript-linter` | **NO** | Misdocumented; actual name `@holoscript/linter` |
| `@hololand/holoscript-formatter` | **NO** | Misdocumented; actual name `@holoscript/formatter` |
| `@hololand/react-agent-sdk` | **NO** (lives in HoloScript repo) | Naming anomaly |

---

## 5. Public API Contamination

Because `packages/core/src/barrel/index.ts:24` re-exports `hololand-runtime`, and `packages/core/src/barrel/exports-semantics-diff-wasm.ts:11` exports `* as hololand from '../hololand'`, the following HoloLand-specific symbols are part of the public `@holoscript/core` API:

- `WorldDefinition`, `WorldMetadata`, `WorldConfig`, `WorldEnvironment`, `WorldZone`, `SpawnPoint`, `ZoneTrigger`, `WorldEvent`, `WorldEventAction`, `WorldScript`, `WorldLODConfig`, `SceneNode`, `WorldPlatform`, `WorldCategory`, `WorldBounds`, `PhysicsConfig`, `RenderingConfig`, `AudioConfig`, `NetworkingConfig`, `PerformanceBudgets`, `AccessibilityConfig`, `SkyboxConfig`, `AmbientLightConfig`, `DirectionalLightConfig`, `TimeOfDayConfig`, `WeatherConfig`, `PostProcessingConfig`, `PostProcessingEffect`, `createWorldDefinition`, `createWorldMetadata`, `createWorldConfig`, `createWorldEnvironment`
- `HololandClient`, `HololandClientConfig`, `ConnectionInfo`, `RuntimeServices`, `AssetStreamingService`, `NetworkingService`, `AudioService`, `AudioPlayOptions`, `AudioHandle`, `AudioSource`, `PhysicsService`, `RigidBodyConfig`, `ColliderShape`, `PhysicsBody`, `RaycastResult`, `InputService`, `InputBinding`, `XRControllerState`, `AnalyticsService`, `PerformanceMetrics`, `VoiceService`, `TTSOptions`, `StorageService`, `getHololandClient`, `connectToHololand`, `disconnectFromHololand`
- `PhysicsBoundsRegistry`, `CrossValidationRegistry`, `ItemManifest`, `StreamingProtocol`

This means a breaking change to HoloLand's world schema or streaming protocol becomes a breaking change to `@holoscript/core`.

---

## 6. Recommendations

1. **Migrate `packages/hololand-platform/` to HoloLand repo**
   The entire `@holoscript/hololand-platform` package is HoloLand domain code. It should be moved to `HoloLand/packages/` and renamed to `@hololand/platform` (or similar) to align with the rest of the HoloLand platform packages.

2. **Extract `packages/core/src/hololand/` into a dedicated cross-repo contract package**
   The world schema, streaming protocol, and integration interfaces in `core/src/hololand/` should either:
   - Move to a new `@hololand/core-contracts` package in the HoloLand repo, or
   - Stay in HoloScript as `@holoscript/hololand-contracts` but **must not** be part of the generic `@holoscript/core` barrel.
   Remove the `export * from './hololand-runtime'` from `packages/core/src/barrel/index.ts`.

3. **Move `packages/runtime/src/traits/HoloLandTraits.ts` to HoloLand**
   These are game-specific runtime adapters. They belong in HoloLand's trait or runtime packages, not in the generic HoloScript runtime.

4. **Fix `@hololand/gpu` references**
   In `packages/engine/src/runtime/BuiltinRegistry.ts`, replace `await import('@hololand/gpu')` with the actual HoloLand GPU package (likely `@hololand/core` or `@hololand/renderer`), or remove the builtins if the package does not exist yet.

5. **Fix JSDoc package names**
   Update `packages/linter/src/index.ts` JSDoc from `@hololand/holoscript-linter` to `@holoscript/linter`.
   Update `packages/formatter/src/index.ts` JSDoc from `@hololand/holoscript-formatter` to `@holoscript/formatter`.

6. **Resolve `@hololand/react-agent-sdk` anomaly**
   Either move the package to the HoloLand repo and update its workspace dependencies, or rename it to `@holoscript/react-agent-sdk` to reflect its actual residence.

7. **Migrate `packages/framework/src/board/hololand-receipts.ts` and `packages/marketplace-api/src/hololandRoutes.ts`**
   Move HoloLand-specific receipt types and API routes to the HoloLand repo, leaving only generic framework/marketplace primitives in HoloScript.

8. **Add a CI gate**
   Introduce a script that fails CI when new `@hololand/` dynamic imports are added without a corresponding package existing in the HoloLand repo, and when new HoloLand-specific code is added to `packages/core/src/hololand/` or `packages/hololand-platform/`.
