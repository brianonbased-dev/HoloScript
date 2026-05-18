# @holoscript/security-sandbox

## 1.2.3

### Patch Changes

- Updated dependencies [c6e69b8]
- Updated dependencies [440e163]
  - @holoscript/engine@6.1.0
  - @holoscript/core@6.1.0
  - @holoscript/holo-vm@6.1.0

## 1.2.2

### Patch Changes

- Updated dependencies
  - @holoscript/core@6.1.0
  - @holoscript/engine@6.1.0
  - @holoscript/holo-vm@6.1.0

## 1.2.1

### Patch Changes

- c330bbf: # CAEL cognition + MCP provenance patch release

  Align CAEL cognition and release metadata for recent simulation and MCP work.
  - Default Phase 2 CAEL cognition wiring to `SNNCognitionEngine` (async-safe `think()`/`tick()` path).
  - Add explicit initialized WebGPU cognition integration coverage with deterministic CPU fallback assertions.
  - Remove/deprecate legacy inline `SNNCognition` export path from active simulation wiring.
  - Add MCP absorb provenance answer envelope dispatch and tool wiring coverage.
  - Add contracted sandbox execution flow with CAEL trace metadata.
  - Sync root changelog and release versioning documentation to current repository state.

- Updated dependencies [c330bbf]
  - @holoscript/engine@6.0.3
  - @holoscript/core@6.0.3
  - @holoscript/holo-vm@6.0.3
