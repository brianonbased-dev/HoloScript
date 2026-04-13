# Tropical Algebra Coverage (Canonical)

This document is the canonical map of tropical algebra coverage in HoloScript.

Use it to answer three questions quickly:

1. Where is tropical algebra implemented?
2. Where is it tested and benchmarked?
3. Where is it exposed to agents and developers?

## Coverage by package

### `packages/core`

- Semiring primitives and strategy adapter:
  - `src/compiler/traits/Semiring.ts`
- Provenance conflict-resolution integration:
  - `src/compiler/traits/ProvenanceSemiring.ts`
- Compiler/composer usage:
  - `src/compiler/BabylonCompiler.ts`
  - `src/compiler/R3FCompiler.ts`
  - `src/compiler/TraitComposer.ts`
  - `src/compiler/TraitCompositionCompiler.ts`
  - `src/legacy-exports.ts` (export surface)

### `packages/snn-webgpu`

- Tropical activation bridge:
  - `src/traits/TropicalActivationTrait.ts`
- Tropical shortest-path algebra:
  - `src/graph/TropicalShortestPaths.ts`
  - `src/graph/TropicalGraphUtils.ts`
- GPU kernels:
  - `src/shaders/tropical-activation.wgsl`
  - `src/shaders/tropical-graph.wgsl`
- Pipeline registration:
  - `src/pipeline-factory.ts`

### `packages/absorb-service`

- Tropical weighted call-chain trace option:
  - `src/engine/CodebaseGraph.ts`
  - `src/engine/GraphRAGEngine.ts`
  - `src/mcp/codebase-tools.ts`

## Verification coverage

### Core algebra tests

- `packages/core/src/compiler/__tests__/ProvenanceSemiring.test.ts`
  - identities
  - distributivity
  - commutativity
  - annihilators
  - `strategyToSemiring()` adapter behavior
- `packages/core/src/__tests__/compiler/TraitComposition.test.ts`
- `packages/core/src/compiler/__tests__/TraitCompositionIntegration.test.ts`

### SNN/WebGPU tests and benchmarks

- `packages/snn-webgpu/src/__tests__/tropical-activation.test.ts`
- `packages/snn-webgpu/src/__tests__/tropical-shortest-paths.test.ts`
- `packages/snn-webgpu/src/__tests__/tropical-graph-utils.test.ts`
- `packages/snn-webgpu/src/__tests__/tropical-shortest-paths.benchmark.test.ts`

### Absorb service tests

- `packages/absorb-service/src/engine/__tests__/CodebaseGraph.patch.test.ts`

## Agent-facing behavior

For `holo_query_codebase` trace queries, tropical algebra is surfaced via:

- `traceStrategy="bfs"` (default): minimum hops, unweighted.
- `traceStrategy="tropical-min-plus"`: weighted shortest path using min-plus cost accumulation.

This is exposed in MCP schema/help text in:

- `packages/absorb-service/src/mcp/codebase-tools.ts`

## Non-goals / false-positive clarifier

Not every use of the word `tropical` indicates tropical algebra.

Examples such as climate zones, template names, or content prompts are thematic text
and should not be counted as algebra/runtime coverage.
