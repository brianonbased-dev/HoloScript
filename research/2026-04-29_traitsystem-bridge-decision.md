# TraitSystem bridge decision — 2026-04-29

Task: `task_1777257549863_81f7`

## Decision

**Bridge core/traits and runtime/traits. Do NOT collapse into a single TraitSystem.**

## Why

Two systems are currently optimized for different domains:

1. **Core-side trait runtime** (authoring/runtime semantics):
   - `packages/core/src/HoloScriptRuntime.ts` owns trait handler registration/execution.
   - `packages/core/src/traits/VRTraitSystem.ts` and `TraitHandler` contracts are `HSPlusNode`-centric.
   - This side is tightly coupled to parser/runtime semantics and compile-time trait naming.

2. **Runtime package TraitSystem** (renderer integration):
   - `packages/runtime/src/traits/TraitSystem.ts` is `THREE.Object3D`-centric with `PhysicsWorld` context.
   - This side is optimized for scene-object lifecycle and renderer/physics loops.

These are not equivalent abstractions. Collapsing now would either:

- leak renderer objects into core semantics, or
- force core node semantics into renderer lifecycle internals.

Both increase coupling and break the architecture rule that core semantics and renderer adapters stay separable.

## Bridge contract (chosen architecture)

Introduce an explicit adapter boundary:

- **Core remains source-of-truth for trait semantics/events.**
- **Runtime remains source-of-truth for THREE object lifecycle.**
- New bridge layer translates between:
  - `HSPlusNode` + trait events (core), and
  - `THREE.Object3D` + physics context (runtime).

### Minimal bridge API

```ts
interface TraitRuntimeBridge {
  bind(nodeId: string, node: HSPlusNode, object3d: THREE.Object3D): void;
  unbind(nodeId: string): void;
  syncFromCore(nodeId: string): void;   // core → runtime props/transform
  syncToCore(nodeId: string): void;     // runtime → core observed state (opt-in)
  dispatch(event: TraitEvent): void;    // bus fan-out across both systems
}
```

## Rules for motion-matching / neural locomotion tasks

1. `NeuralAnimationTrait` and `MotionMatchingEngine` stay in **core**.
2. Renderer-specific IK/foot-plant object updates stay in **runtime**.
3. Event names are shared and versioned (`on_foot_contact`, etc.); payload schema is owned by core contracts.
4. No direct import from `packages/runtime` into `packages/core`.
5. Bridge package/module may import both; each side only imports bridge interface.

## Migration plan

### Phase A (safe, no behavior break)

- Add bridge interface + no-op implementation.
- Add integration tests verifying event passthrough and transform sync semantics.

### Phase B (opt-in wiring)

- Wire neural locomotion events (`on_foot_contact`, `on_stumble_detected`) through bridge to runtime listeners.
- Keep existing code paths active as fallback.

### Phase C (de-duplication)

- Move duplicated trait lifecycle glue into bridge-backed utilities.
- Keep both systems, remove duplicate ad-hoc wiring.

## Exit criteria

- Core trait tests pass unchanged.
- Runtime scene update loop still deterministic.
- Motion-matching events consumed by runtime listeners without direct core↔runtime imports.
- No regressions in `NeuralAnimationTrait.motion-matching` tests.

## Risk register

- **Risk:** Double-application of transforms if both sides mutate same field.
  - **Mitigation:** single-writer policy per field (`position/rotation` writer declared in bridge config).
- **Risk:** Event-order drift across systems.
  - **Mitigation:** monotonic sequence IDs on bridge-dispatched events.
- **Risk:** Hidden coupling reintroduced by convenience imports.
  - **Mitigation:** lint rule forbidding `packages/core` → `packages/runtime` imports.

## Conclusion

The blocker for BUILD-1 is resolved at architecture level: **bridge** is the approved direction. Collapsing the systems would trade a short-term simplification for long-term coupling debt across core semantics and renderer runtime concerns.
