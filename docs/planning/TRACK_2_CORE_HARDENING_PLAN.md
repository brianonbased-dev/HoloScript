# Track 2: Core Engine Hardening Plan

**Status**: Planning Phase Complete (Absorb Graph Generated)
**Knowledge Graph File**: `packages/core/core_compiler_knowledge.holo`

## 1. Context from AST Graph

A structural analysis of `packages/core/src/compiler` via `holoscript absorb` highlights the compilation hot paths:

- **Memory Hotspots**: `GLTFPipeline.ts` and `R3FCompiler.ts` instantiate thousands of intermediate AST nodes without aggressive garbage collection pooling, leading to OOMs on scenes >50MB.
- **Test Gaps**: The core AI logic traits (`@agent`, `BehaviorTree`) lack comprehensive isolated unit tests that mock the standard ECS heartbeat.

## 2. Execution Blueprint (Phase 2A and 2B)

### Step 1: OOM Bottleneck Resolution (GLTF & R3F)

- **Target**: `packages/core/src/compiler/GLTFPipeline.ts` and `R3FCompiler.ts`
- **Action**:
  - Implement an AST Node Object Pool pattern. Instead of `new Node()` for every syntax leaf, acquire from a pre-allocated pool.
  - Stream large buffer representations (`ArrayBuffer`) directly to the WASM bindings rather than converting to Base64 strings in memory.
- **Validation**: Compile the `examples/specialized/iot/smart-factory.holo` (110MB) with a heap limit of `512MB` and assert success.

### Step 2: Test Coverage Supremacy (AI Subsystems)

- **Target**: `packages/core/src/runtime/` or `packages/core/tests/`
- **Action**: Write 50+ new Vitest scenarios verifying:
  - Dialogue state machines transitioning under stress load.
  - Spatial pathfinding correctly falling back when navmeshes are disjointed.
- **Goal**: Push aggregate coverage from 40% to >85% for pure logic paths.

## 3. Deployment Checklist

- [ ] Run Memory Profiler (`node --inspect`).
- [ ] Update `docs/architecture/COMPILER.md` with the new Object Pool memory model.
- [ ] Log benchmark improvements in `docs/PERFORMANCE_BENCHMARKS.md`.
