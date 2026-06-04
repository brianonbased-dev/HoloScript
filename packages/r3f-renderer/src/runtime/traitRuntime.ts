/**
 * traitRuntime — the per-frame trait execution core (I.007 dogfooding closure).
 *
 * This is the foundational capability that lets COMPILED HoloScript behavior run
 * in the renderer: a generic loop that, each frame, calls a trait handler's
 * `onUpdate(node, config, context, delta)`. Until now nothing in the R3F render
 * path ticked trait handlers — sim-coupling (morphogen / turgor / meristem) was
 * hand-written in bespoke `useFrame` loops (see services/holoscript-net
 * LotusProgram.tsx). With this, `@botanical_lotus`'s steppers can be authored as
 * trait `onUpdate` and ticked generically, so the renderer can be GENERATED from
 * `.holo` rather than hand-authored. Reusable for every trait, not just the lotus.
 *
 * Pure functions (no React / no Canvas) so the behavior is unit-testable without a
 * WebGL context; `RuntimeTraitHost.tsx` is the thin `useFrame`/`useEffect` wrapper.
 *
 * @cites I.007, D.012, F.099, F.037, plan §0.7 / task_1780467909796_0qfk
 */
import type { TraitHandler, TraitContext, HSPlusNode } from '@holoscript/core';

/** A trait handler paired with the config instance to run it with. */
export interface RuntimeTraitBinding<C = unknown> {
  handler: TraitHandler<C>;
  /** Per-instance config; falls back to the handler's `defaultConfig` when omitted. */
  config?: C;
}

/** Default per-frame delta clamp (seconds). Prevents a huge integration step after
 *  a tab-away / breakpoint stall (which would blow up an explicit sim). ~10 FPS floor. */
export const DEFAULT_MAX_DELTA = 0.1;

function resolveConfig<C>(b: RuntimeTraitBinding<C>): C {
  return (b.config ?? b.handler.defaultConfig) as C;
}

/** Fire `onAttach` for each binding, in order. Call once when the node mounts. */
export function attachTraits(
  node: HSPlusNode,
  bindings: ReadonlyArray<RuntimeTraitBinding>,
  context: TraitContext,
): void {
  for (const b of bindings) {
    b.handler.onAttach?.(node, resolveConfig(b), context);
  }
}

/**
 * Advance every bound trait by one frame: `onUpdate(node, config, context, dt)`.
 * `delta` is clamped to `[0, maxDelta]` so a stalled frame can't detonate a sim.
 * Returns the clamped dt actually used (handy for tests / chaining).
 */
export function tickTraits(
  node: HSPlusNode,
  bindings: ReadonlyArray<RuntimeTraitBinding>,
  context: TraitContext,
  delta: number,
  maxDelta: number = DEFAULT_MAX_DELTA,
): number {
  const dt = delta < 0 ? 0 : delta > maxDelta ? maxDelta : delta;
  for (const b of bindings) {
    b.handler.onUpdate?.(node, resolveConfig(b), context, dt);
  }
  return dt;
}

/** Fire `onDetach` for each binding in REVERSE order (LIFO, mirroring attach).
 *  Call once when the node unmounts. */
export function detachTraits(
  node: HSPlusNode,
  bindings: ReadonlyArray<RuntimeTraitBinding>,
  context: TraitContext,
): void {
  for (let i = bindings.length - 1; i >= 0; i -= 1) {
    bindings[i].handler.onDetach?.(node, resolveConfig(bindings[i]), context);
  }
}

/**
 * Build a minimal, self-contained `TraitContext` with a real state bag
 * (`getState`/`setState`) — the part stateful sim traits (morphogen, turgor)
 * actually need to integrate across frames — plus no-op stubs for the
 * VR/physics/audio/haptics surfaces a pure render host doesn't provide.
 * Pass `overrides` to inject real subsystems (camera, physics, emit sink, …).
 */
export function createTraitContext(overrides: Partial<TraitContext> = {}): TraitContext {
  const state: Record<string, unknown> = {};
  const zero = () => ({ x: 0, y: 0, z: 0 });
  const base: TraitContext = {
    vr: {
      hands: { left: null, right: null },
      headset: { position: zero(), rotation: zero() },
      getPointerRay: () => null,
      getDominantHand: () => null,
    },
    physics: {
      applyVelocity: () => {},
      applyAngularVelocity: () => {},
      setKinematic: () => {},
      raycast: () => null,
      getBodyPosition: () => null,
      getBodyVelocity: () => null,
    },
    audio: { playSound: () => {} },
    haptics: { pulse: () => {}, rumble: () => {} },
    emit: () => {},
    getState: () => state,
    setState: (updates) => {
      Object.assign(state, updates);
    },
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    ...overrides,
  };
  return base;
}
