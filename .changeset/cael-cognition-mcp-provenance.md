---
"@holoscript/engine": patch
"@holoscript/mcp-server": patch
"@holoscript/security-sandbox": patch
---

# CAEL cognition + MCP provenance patch release

Align CAEL cognition and release metadata for recent simulation and MCP work.

- Default Phase 2 CAEL cognition wiring to `SNNCognitionEngine` (async-safe `think()`/`tick()` path).
- Add explicit initialized WebGPU cognition integration coverage with deterministic CPU fallback assertions.
- Remove/deprecate legacy inline `SNNCognition` export path from active simulation wiring.
- Add MCP absorb provenance answer envelope dispatch and tool wiring coverage.
- Add contracted sandbox execution flow with CAEL trace metadata.
- Sync root changelog and release versioning documentation to current repository state.
