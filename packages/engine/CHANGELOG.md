# @holoscript/engine

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
