/**
 * HolographicCompositor — Production Test Suite
 *
 * Integration: mount the REAL HolographicSpriteTrait with depthMode='continuous'
 * + compositeReady=true, tick, and assert a compositor consumer recomputed a
 * frame. Fails on the pre-fix code (frame-update went off an untyped node with
 * no listener → composite never recomposed).
 */
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../events';
import { HolographicCompositor, createHolographicCompositor } from '../HolographicCompositor';
import { holographicSpriteTraitHandler } from '../../../core/src/traits/HolographicSpriteTrait';

/** Context whose emit forwards into the EventBus (mirrors the runtime bridge). */
function makeTraitContext(bus: EventBus) {
  const spy = vi.fn((event: string, payload?: unknown) => bus.emit(event, payload));
  return { emit: spy };
}

function mountContinuous(bus: EventBus, nodeId = 'hologram_1') {
  const node: any = {
    __typename: 'HSPlusNode',
    id: nodeId,
    emit: vi.fn(),
    on: vi.fn(),
  };
  // Skip async onAttach pipeline; set the composite-ready state directly.
  node.__holographicSpriteState = {
    compositing: true,
    compositeReady: true,
    lastFrameTime: 0,
    error: null,
  };
  const ctx = makeTraitContext(bus);
  const cfg = { depthMode: 'continuous' as const };
  return {
    node,
    ctx,
    tick: (delta = 0.016) => holographicSpriteTraitHandler.onUpdate(node, cfg, ctx as any, delta),
  };
}

describe('HolographicCompositor — Pattern E wiring', () => {
  it('registers a listener for holographic:frame-update (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('holographic:frame-update')).toBe(0);
    const comp = new HolographicCompositor({ bus });
    comp.start();
    expect(bus.listenerCount('holographic:frame-update')).toBeGreaterThan(0);
  });

  it('frame-update now routes through TraitContext, not the untyped node', () => {
    const bus = new EventBus();
    createHolographicCompositor({ bus });
    const { node, ctx, tick } = mountContinuous(bus);
    tick();
    // The fix: emit goes through context, NOT (node as any).emit.
    expect(ctx.emit).toHaveBeenCalledWith('holographic:frame-update', expect.any(Object));
    expect(node.emit).not.toHaveBeenCalledWith('holographic:frame-update', expect.anything());
  });

  it('continuous-mode tick recomposes a frame (the done-when assertion)', () => {
    const bus = new EventBus();
    const comp = createHolographicCompositor({ bus });
    const { tick } = mountContinuous(bus, 'hologram_1');

    expect(comp.getComposite('hologram_1')).toBeUndefined();
    tick();

    const frame = comp.getComposite('hologram_1')!;
    expect(frame).toBeDefined();
    expect(frame.frameIndex).toBe(1);
    expect(frame.delta).toBeCloseTo(0.016, 6);
    expect(frame.parallaxPhase).toBeGreaterThanOrEqual(0);
    expect(frame.parallaxPhase).toBeLessThan(1);
  });

  it('advances the composite frame index across ticks + sweeps parallax phase', () => {
    const bus = new EventBus();
    const comp = createHolographicCompositor({ bus, parallaxPeriodMs: 1000 });
    const { tick } = mountContinuous(bus, 'hologram_1');

    let prevPhase = -1;
    for (let i = 1; i <= 5; i++) {
      tick(0.05); // 50ms/frame
      expect(comp.getFrameIndex('hologram_1')).toBe(i);
      const phase = comp.getComposite('hologram_1')!.parallaxPhase;
      // 50ms over a 1000ms period → phase advances 0.05 each frame.
      expect(phase).toBeGreaterThan(prevPhase);
      prevPhase = phase;
    }
  });

  it('on-demand mode emits no frame-update → no recomposition', () => {
    const bus = new EventBus();
    const comp = createHolographicCompositor({ bus });
    const { node, ctx } = mountContinuous(bus, 'hologram_1');
    holographicSpriteTraitHandler.onUpdate(node, { depthMode: 'on-demand' }, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalledWith('holographic:frame-update', expect.anything());
    expect(comp.count()).toBe(0);
  });

  it('not compositeReady → no frame-update', () => {
    const bus = new EventBus();
    const comp = createHolographicCompositor({ bus });
    const { node, ctx } = mountContinuous(bus, 'hologram_1');
    node.__holographicSpriteState.compositeReady = false;
    holographicSpriteTraitHandler.onUpdate(node, { depthMode: 'continuous' }, ctx as any, 0.016);
    expect(ctx.emit).not.toHaveBeenCalled();
    expect(comp.count()).toBe(0);
  });
});
