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
| `onnx_runtime` | `packages/core/src/traits/OnnxRuntimeTrait.ts` | `onUpdate` is intentionally empty; behavior is event-driven | 0 direct quoted refs in compiler map scan | Possible Pattern-E risk if trait is runtime-only but not compiler-activated. Needs design decision: runtime-only seam vs compiler surface. |
| `neural_forge` | `packages/core/src/traits/NeuralForgeTrait.ts` | Non-trivial watchdog + timeout fallback present in `onUpdate` | 12 | Historically stub-shaped, now partially wired. Needs consumer wiring audit for emitted events to avoid emit-without-listener void. |
| `neural_animation` | `packages/core/src/traits/NeuralAnimationTrait.ts` | Motion-matching path is now wired and tested | 15 | No longer Pattern-B by body-size criterion; retain as monitor item because of high compiler surface area. |

## Pattern-E (emit-without-listener) risk summary

- `NeuralForgeTrait` and `OnnxRuntimeTrait` both emit multiple events and should be checked for downstream listeners in runtime/studio/engine.
- If listeners exist only in tests, treat as Pattern-E and create consumer-wiring tasks.

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
