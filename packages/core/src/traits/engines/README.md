# `@holoscript/core/traits/engines`

Engine math for trait-driven simulation. Per **RULING 2** (idea-run-3,
2026-04-26): engine math lives ONCE; both `core/traits/` (AST-side
declarations) and `runtime/traits/` (THREE.js-side execution) delegate to
the same engine.

This directory currently contains **three engines with three different
contracts**. They are intentionally NOT unified behind a base interface yet
— per /critic batch-6 (2026-04-27): "three implementations is right at the
boundary where a base helps OR hurts." When a fourth lands, we revisit. For
now, callers must know which contract they're using.

## Contracts at a glance

| Engine | Shape | Lifecycle | Mutation model |
|--------|-------|-----------|----------------|
| `motion-matching` | Class + factory + free helpers | `load()` / `infer()` / `dispose()` | Pure — returns new result per call |
| `cloth-verlet` | Free functions + state interfaces | None — caller owns state lifecycle | In-place — mutates Float32Array buffers |
| `onnx-adapter` | Class + factory | `load(url)` / `run(req)` / `dispose()` | Pure — returns new tensors per call |

Plus one schema + one synthetic engine:

| File | Purpose |
|------|---------|
| `motion-data-schema.ts` | Type definitions + validators for motion training/inference data (no engine; types only) |
| `synthetic-walk-cycle.ts` | Procedural `MotionMatchingEngine` impl — biped walk gait, no NN |

## When to use which

### `motion-matching.ts` — `MotionMatchingEngine`
Use when implementing a NEURAL motion engine (Phase-Functioned NN, NSM, DeepPhase). Class with async load + sync infer. Dispatches on phase + velocity + terrain inputs and produces pose + trajectory + contact + gait + kineticEnergyProxy.

```ts
const engine = new MyMotionEngine('biped_v2');
await engine.load();
const result = engine.infer({ targetVelocity, currentPhase, delta });
```

Default fallback: `NullMotionMatchingEngine` (deterministic pass-through).
Synthetic fallback: `SyntheticWalkCycleEngine` (procedural biped walk).
Real-NN backends slot in here per /founder ruling 2026-04-26 (primary-literature reimplement).

### `cloth-verlet.ts` — Free functions + `ClothVerletState`
Use when implementing cloth simulation. Pure math operating in-place on
caller-owned `Float32Array` position buffers. Caller manages allocation
and lifecycle. No class, no async, no events.

```ts
const constraints = buildClothConstraints(resolution, positions);
const state: ClothVerletState = { positions, prevPositions, pinned, constraints, time: 0 };
stepClothVerlet(state, config, delta); // mutates state.positions in place
```

This contract is appropriate when buffers are shared with GPU upload paths
(THREE.BufferAttribute aliasing) — copy-elision matters at scene scale.

**Caveat**: aliasing safety is convention, not API. THREE.BufferAttribute
v0.182.0 keeps `array` as a reference but a future copy-on-mutate change
would break this. See /critic batch-6 Serious #6 for runtime-test guidance.

### `onnx-adapter.ts` — `InferenceAdapter`
Use when wrapping an external ML inference backend (ONNX Runtime Web/Node,
WebLLM, transformers.js). Class with async load + async run + dispose.
Dispatches named tensor inputs and produces named tensor outputs.

```ts
const adapter = new MyInferenceAdapter();
await adapter.load('model.onnx');
const response = await adapter.run({ inputs: { x: tensor }, outputs: ['y'] });
```

Default fallback: `NoOpInferenceAdapter` (zero-filled outputs matching first input shape).
Real backends ship in BUILD-1 follow-up alongside actual NN architectures.

## Why three contracts, not one?

- **motion-matching** has `loaded` because real NN backends need async
  weight load. `load()` is a contract gate; `infer()` is sync (called
  every frame).
- **cloth-verlet** has no lifecycle because Verlet integration is
  stateless math operating on caller-owned buffers. Forcing it into a
  class would add allocation overhead at scene scale.
- **onnx-adapter** has `run()` async because any real ONNX runtime is async
  (WebGPU dispatch, WASM message-passing, native FFI). `infer()` would
  lie if we made it sync.

The three contracts are correct for their domains. A unified base would
either be lowest-common-denominator (no `load`, sync only — useless for
real NN) OR maximum-common (async everything — overkill for cloth).

## When to add a new engine

Per the per-trait wrapper pattern (RULING 2), new engines arrive when:
1. A trait does meaningful math that runs in BOTH AST-side declaration
   (for compilers/tooling) AND THREE.js-side runtime (for scene rendering).
2. The math is **pure** (or pure-with-state-buffer) — no THREE/PhysicsWorld
   dependency.
3. There's a working impl somewhere (usually `runtime/src/traits/PhysicsTraits.ts`)
   to extract.

Bad signals — DON'T extract:
- Trait emits events into the void (Pattern E — fix the consumer first, /critic
  batch-6 Critical #1).
- Math depends on `THREE.Object3D`/`PhysicsWorld` directly (engine should
  receive raw buffers).
- "Wrapping" an SDK that already has its own surface (just import the SDK).

## Status (2026-04-27)

| Engine | Used by core/traits | Used by runtime/traits | Tested |
|--------|---------------------|------------------------|--------|
| `motion-matching` | `NeuralAnimationTrait.ts` | `NeuralAnimationHandler.ts` | ✓ 49 tests |
| `synthetic-walk-cycle` | (via NeuralAnimationTrait config) | (via NeuralAnimationHandler default) | ✓ 12 tests |
| `cloth-verlet` | (NOT YET — `core/traits/ClothTrait.ts` is a deprecated stub) | `PhysicsTraits.ts` ClothTrait | ✓ 13 tests |
| `onnx-adapter` | `OnnxRuntimeTrait.ts` (NoOp default) | (NOT YET — no runtime consumer) | ✓ 13 tests |
| `motion-data-schema` | (validators imported by training pipelines) | n/a | ✓ schema validators tested |

The two "NOT YET" cells are tracked Pattern E gaps — see board tasks
`task_1777275964528_dz5e` (Studio LocomotionDemoPanel — closes the
runtime-consumer gap for OnnxRuntime+NeuralForge by demonstrating one)
and `task_1777276293841_8r7z` (extend /stub-audit with Pattern E rule).
