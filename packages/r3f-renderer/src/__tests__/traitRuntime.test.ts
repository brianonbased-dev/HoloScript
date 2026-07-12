/**
 * traitRuntime — tests for the per-frame trait execution core (I.007 closure).
 *
 * The keystone test (`STATEFUL sim`) proves the foundational capability: a trait
 * that holds state in the context and integrates it each frame produces the
 * correct trajectory — i.e. morphogen/turgor-style sim-coupling can run generically
 * through the host instead of a hand-written useFrame. The rest pin the lifecycle,
 * the stall-guard delta clamp, and config fallback, plus a real registered handler.
 */
import { describe, it, expect } from 'vitest';
import type { TraitHandler, HSPlusNode } from '@holoscript/core';
import { perceptualColorHandler } from '@holoscript/core/traits';
import {
  attachTraits,
  tickTraits,
  detachTraits,
  createTraitContext,
  DEFAULT_MAX_DELTA,
  type RuntimeTraitBinding,
} from '../runtime/traitRuntime';

const node = { id: 'n1' } as unknown as HSPlusNode;
const h = (partial: Partial<TraitHandler>): TraitHandler =>
  ({ name: 'mock', ...partial }) as unknown as TraitHandler;

describe('traitRuntime — per-frame trait execution core', () => {
  it('attachTraits fires onAttach once per binding, in order', () => {
    const order: string[] = [];
    const bindings: RuntimeTraitBinding[] = [
      { handler: h({ onAttach: () => order.push('a') }) },
      { handler: h({ onAttach: () => order.push('b') }) },
    ];
    attachTraits(node, bindings, createTraitContext());
    expect(order).toEqual(['a', 'b']);
  });

  it('tickTraits calls onUpdate(node, config, context, dt) for each binding', () => {
    const ctx = createTraitContext();
    const calls: Array<{ n: unknown; c: unknown; cx: unknown; dt: number }> = [];
    const handler = h({
      onUpdate: (n, c, cx, dt) => calls.push({ n, c, cx, dt }),
    });
    tickTraits(node, [{ handler, config: { k: 1 } }], ctx, 0.016);
    expect(calls).toHaveLength(1);
    expect(calls[0].n).toBe(node);
    expect(calls[0].c).toEqual({ k: 1 });
    expect(calls[0].cx).toBe(ctx);
    expect(calls[0].dt).toBeCloseTo(0.016);
  });

  it('clamps delta to [0, maxDelta] (stall guard against sim blow-up)', () => {
    const dts: number[] = [];
    const handler = h({ onUpdate: (_n, _c, _cx, dt) => dts.push(dt) });
    const ctx = createTraitContext();
    expect(tickTraits(node, [{ handler }], ctx, 5.0)).toBe(DEFAULT_MAX_DELTA); // huge → clamp
    expect(tickTraits(node, [{ handler }], ctx, -1)).toBe(0); // negative → 0
    expect(tickTraits(node, [{ handler }], ctx, 0.02, 0.05)).toBeCloseTo(0.02); // within → unchanged
    expect(dts).toEqual([DEFAULT_MAX_DELTA, 0, 0.02]);
  });

  it('falls back to handler.defaultConfig when binding config omitted', () => {
    let seen: unknown;
    const handler = h({
      defaultConfig: { rate: 0.5 },
      onUpdate: (_n, c) => {
        seen = c;
      },
    });
    tickTraits(node, [{ handler }], createTraitContext(), 0.01);
    expect(seen).toEqual({ rate: 0.5 });
  });

  it('STATEFUL sim: a decay trait integrated across frames matches exp(-rate·t)', () => {
    // The morphogen/turgor pattern in miniature: state lives in the context, the
    // host ticks onUpdate every frame, and the integrated trajectory is correct.
    // dv/dt = -rate·v  →  explicit Euler v -= rate·v·dt  →  ≈ exp(-rate·t) for small dt.
    const rate = 0.8;
    const decay = h({
      onAttach: (_n, _c, ctx) => ctx.setState({ v: 1.0 }),
      onUpdate: (_n, _c, ctx, dt) => {
        const v = ctx.getState().v as number;
        ctx.setState({ v: v - rate * v * dt });
      },
    });
    const ctx = createTraitContext();
    attachTraits(node, [{ handler: decay }], ctx);
    const dt = 0.002;
    const steps = 1000; // t = 2.0
    for (let i = 0; i < steps; i += 1) tickTraits(node, [{ handler: decay }], ctx, dt);
    const v = ctx.getState().v as number;
    const analytical = Math.exp(-rate * dt * steps); // exp(-1.6) ≈ 0.2019
    expect(v).toBeGreaterThan(0);
    expect(Math.abs(v - analytical) / analytical).toBeLessThan(0.02);
  });

  it('ticks multiple traits each frame, in binding order', () => {
    const order: string[] = [];
    const bindings: RuntimeTraitBinding[] = [
      { handler: h({ onUpdate: () => order.push('first') }) },
      { handler: h({ onUpdate: () => order.push('second') }) },
    ];
    tickTraits(node, bindings, createTraitContext(), 0.016);
    expect(order).toEqual(['first', 'second']);
  });

  it('detachTraits fires onDetach in reverse order (LIFO mirror of attach)', () => {
    const order: string[] = [];
    const bindings: RuntimeTraitBinding[] = [
      { handler: h({ onDetach: () => order.push('a') }) },
      { handler: h({ onDetach: () => order.push('b') }) },
    ];
    detachTraits(node, bindings, createTraitContext());
    expect(order).toEqual(['b', 'a']);
  });

  it('integrates a REAL registered trait handler through the full lifecycle without throwing', () => {
    const ctx = createTraitContext();
    const binding: RuntimeTraitBinding = {
      handler: perceptualColorHandler as unknown as TraitHandler,
      config: (perceptualColorHandler.defaultConfig ?? {}) as unknown,
    };
    expect(() => {
      attachTraits(node, [binding], ctx);
      tickTraits(node, [binding], ctx, 0.016);
      detachTraits(node, [binding], ctx);
    }).not.toThrow();
  });
});
