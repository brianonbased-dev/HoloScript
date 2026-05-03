# Stub-audit report — 2026-04-29

Task: `task_1777257549863_89s9`
Scope: `packages/core/src/traits/*Trait.ts` cross-referenced with compiler usages in `packages/core/src/compiler/**/*.ts`

## Method

- Parsed each trait file for `onUpdate(...) { ... }` body.
- Computed **effective onUpdate LOC** by excluding blank/comment-only lines and pure `context.emit` lines.
- Cross-referenced trait keys in compiler files using exact quoted trait-name matches.

## Confirmed Pattern-B violations (high confidence)

| Trait | File | Effective onUpdate LOC | Compiler refs | Why flagged |
| --- | --- | ---: | ---: | --- |
| `neural_link` | `packages/core/src/traits/NeuralLinkTrait.ts` | 2 | 11 | Runtime body is effectively heartbeat/comment-level while multiple compilers treat trait as live feature surface. |

## Potential Pattern-B / Pattern-E candidates (requires manual adjudication)

| Trait | File | Observed shape | Compiler refs | Notes |
| --- | --- | --- | ---: | --- |
| `onnx_runtime` | `packages/core/src/traits/OnnxRuntimeTrait.ts` | `onUpdate` is intentionally empty; behavior is event-driven | 0 direct quoted refs in compiler map scan | **RESOLVED**: Runtime-only seam is correct. No compiler surface needed — the trait uses an adapter pattern (`InferenceAdapter`) where the execution backend is injected at runtime. EffectInference declares `resource:cpu` + `resource:memory` which is sufficient. Guard tests added. JSDoc and trait-mappings.md updated with contract documentation. Pattern-E (emit-without-listener) risk documented — consumers will be wired as real backends land. |
| `neural_forge` | `packages/core/src/traits/NeuralForgeTrait.ts` | Non-trivial watchdog + timeout fallback present in `onUpdate` | 12 | Historically stub-shaped, now partially wired. Needs consumer wiring audit for emitted events to avoid emit-without-listener void. |
| `neural_animation` | `packages/core/src/traits/NeuralAnimationTrait.ts` | Motion-matching path is now wired and tested | 15 | No longer Pattern-B by body-size criterion; retain as monitor item because of high compiler surface area. |

## Pattern-E (emit-without-listener) risk summary

- `NeuralForgeTrait` and `OnnxRuntimeTrait` both emit multiple events and should be checked for downstream listeners in runtime/studio/engine.
- `OnnxRuntimeTrait`: **RESOLVED** — confirmed no runtime consumers exist outside tests. Pattern-E risk documented in JSDoc + trait-mappings.md. Consumer wiring deferred until real backends (HoloGram depth, motion matching) land.
- `NeuralForgeTrait`: **RESOLVED** — NeuralForgeCoordinator (5th consumer-bus) closes Pattern E. Subscribes to all 5 emitted events (neural_forge_connected, neural_synthesis_request, neural_synthesis_timeout, neural_shard_created, neural_cognition_evolved), tracks per-node state (shards, weights, pending synthesis, timeout fallback). Wired into TraitRuntimeIntegration alongside the 4 existing buses. 21 tests pass. (task_1777423899630_nsna)

## Board tasks seeded from this report

Created follow-up board tasks for:

1. `neural_link` runtime wiring (replace comment-level `onUpdate` with operational inference/scheduling work).
2. `onnx_runtime` contract clarification + compiler/runtime surface decision.
3. `neural_forge` listener wiring audit (Pattern-E closure).
4. `neural_animation` regression guard to prevent fallback to stub-shape.

## Summary

- Traits scanned: full `*Trait.ts` set (current repo state).
- Confirmed Pattern-B: 1
- Potential Pattern-B / Pattern-E: 3
- Actionable result: follow-up tasks seeded for all 4 neural-family traits named in task description.
