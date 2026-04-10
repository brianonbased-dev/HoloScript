import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GrabbableTrait } from '../GrabbableTrait';

function createGrabbableMockContext() {
  const events: Array<{ type: string; data: any }> = [];
  return {
    emit: (type: string, data: any) => events.push({ type, data }),
    vr: {
      hands: {
        left: null as any,
        right: null as any,
      },
    },
    _events: events,
  };
}

function makeHand(x: number, y: number, z: number, pinch: number) {
  return {
    position: { x, y, z },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
    pinchStrength: pinch,
    gripStrength: 0,
    joints: [],
  };
}

describe('GrabbableTrait', () => {
  let trait: GrabbableTrait;
  let ctx: ReturnType<typeof createGrabbableMockContext>;
  let node: any;

  beforeEach(() => {
    vi.stubGlobal('performance', { now: () => 0 });
    trait = new GrabbableTrait();
    ctx = createGrabbableMockContext();
    node = {
      id: 'obj1',
      properties: {
        position: { x: 0, y: 1, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        rotation: { x: 0, y: 0, z: 0 },
      },
    };
  });

  it('has correct name', () => {
    expect(trait.name).toBe('grabbable');
  });

  it('does not grab when hand is far away', () => {
    ctx.vr.hands.right = makeHand(5, 5, 5, 1.0);
    trait.onUpdate(node, ctx as any, 0.016);
    const grabs = ctx._events.filter((e: any) => e.type === 'physics_grab');
    expect(grabs.length).toBe(0);
  });

  it('grabs when hand is close and pinching', () => {
    ctx.vr.hands.right = makeHand(0, 1, 0, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    const grabs = ctx._events.filter((e: any) => e.type === 'physics_grab');
    expect(grabs.length).toBe(1);
    expect(grabs[0].data.hand).toBe('right');
  });

  it('releases when pinch is released', () => {
    // Grab first
    ctx.vr.hands.right = makeHand(0, 1, 0, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);

    // Release
    ctx.vr.hands.right = makeHand(0, 1, 0, 0.3);
    trait.onUpdate(node, ctx as any, 0.016);
    const releases = ctx._events.filter((e: any) => e.type === 'physics_release');
    expect(releases.length).toBe(1);
  });

  it('onDetach emits physics_release if grabbed', () => {
    ctx.vr.hands.right = makeHand(0, 1, 0, 0.95);
    trait.onUpdate(node, ctx as any, 0.016);
    trait.onDetach(node, ctx as any);
    const releases = ctx._events.filter((e: any) => e.type === 'physics_release');
    expect(releases.length).toBe(1);
  });

  it('onDetach does not emit if not grabbed', () => {
    trait.onDetach(node, ctx as any);
    expect(ctx._events.length).toBe(0);
  });
});
