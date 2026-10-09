# @holoscript/engine

## 6.1.9

### Patch Changes

- Changes since 6.1.7 (2026-08-13): headless lifecycle bodies are parsed and
  interpreted, never run as text, and their calls are checked against the
  provided functions themselves (getters are refused); a composition can author
  the hair chroma blend in character rendering.
- Updated dependencies
- Updated dependencies [30f5639]
  - @holoscript/core@8.9.0
  - @holoscript/snn-webgpu@8.9.0
  - @holoscript/holoembed@6.1.5

## 6.1.7

### Patch Changes

- f2dc653: Add source-recomputed V4 receipts, a same-execution post-seal observer API, and subject-bound observation ledgers.
- 848f3bf: Add rotation-aware cylinder broadphase and exact sphere-cylinder contacts, and use native cylinder collision shapes in deterministic CPU physics receipts.
- 2b399da: Stabilize GJK/EPA resting contacts by removing arbitrary flat-face support-corner torque from the one-point contact manifold.
- Updated dependencies [7c22951]
- Updated dependencies [664f178]
- Updated dependencies [64f7022]
- Updated dependencies [d26629c]
  - @holoscript/core@8.7.0
  - @holoscript/snn-webgpu@8.7.0
  - @holoscript/holoembed@6.1.3

## 6.1.5

### Patch Changes

- Publish the optional `@holoscript/uaal` peer as a same-major compatibility
  range instead of freezing it to the workspace version present at pack time.
  The VM bridge is exercised against `@holoscript/uaal@8.6.1`.

## 6.1.3

### Patch Changes

- 6dc9732: Add engine WGSL raw declarations and Paper 6 browser artifact typing so Studio CI can build engine-sourced WebGPU surfaces.
- Updated dependencies [c64fc1a]
  - @holoscript/core@8.0.6
  - @holoscript/snn-webgpu@8.0.6
  - @holoscript/uaal@8.0.6
  - @holoscript/holoembed@6.1.2

## 6.1.0

### Changed

- Align release metadata with the HoloScript 6.x line. See the root CHANGELOG for the outward-facing release narrative.

## 6.0.3

### Patch Changes

- c330bbf: # CAEL cognition + MCP provenance patch release

  Align CAEL cognition and release metadata for recent simulation and MCP work.
  - Default Phase 2 CAEL cognition wiring to `SNNCognitionEngine` (async-safe `think()`/`tick()` path).
  - Add explicit initialized WebGPU cognition integration coverage with deterministic CPU fallback assertions.
  - Remove/deprecate legacy inline `SNNCognition` export path from active simulation wiring.
  - Add MCP absorb provenance answer envelope dispatch and tool wiring coverage.
  - Add contracted sandbox execution flow with CAEL trace metadata.
  - Sync root changelog and release versioning documentation to current repository state.
  - @holoscript/core@6.0.3
  - @holoscript/framework@6.0.3
  - @holoscript/snn-webgpu@6.0.3
  - @holoscript/uaal@6.0.3
