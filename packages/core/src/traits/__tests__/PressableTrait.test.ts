import { describe, it, expect, beforeEach } from 'vitest';
import { PressableTrait } from '../PressableTrait';

function createPressableMockContext() {
  const events: Array<{ type: string; data: any }> = [];
  return {
    emit: (type: string, data: any) => events.push({ type, data }),
    physics: {
      getBodyPosition: (_id: string) => ({ x: 0, y: 0, z: 0 }),
    },
    haptics: {
      pulse: (_hand: string, _intensity: number, _duration: number) => {},
    },
    _events: events,
  };
}

describe('PressableTrait', () => {
  let trait: PressableTrait;
  let ctx: ReturnType<typeof createPressableMockContext>;
  let node: any;

  beforeEach(() => {
    trait = new PressableTrait();
    ctx = createPressableMockContext();
    node = {
      id: 'btn1',
      properties: {
        distance: 0.01,
        stiffness: 100,
        damping: 5,
        position: { x: 0, y: 0, z: 0 },
        triggerPoint: 0.5,
        releasePoint: 0.3,
      },
    };
  });

  it('has correct name', () => {
    expect(trait.name).toBe('pressable');
  });

  it('onAttach emits physics_add_constraint', () => {
    trait.onAttach(node, ctx as any);
    expect(ctx._events.length).toBe(1);
    expect(ctx._events[0].type).toBe('physics_add_constraint');
    expect(ctx._events[0].data.type).toBe('prismatic');
  });

  it('onUpdate captures initial position', () => {
    trait.onAttach(node, ctx as any);
    trait.onUpdate(node, ctx as any, 0.016);
    // No press events should fire at z=0
    const pressEvents = ctx._events.filter((e: any) => e.type === 'ui_press_start');
    expect(pressEvents.length).toBe(0);
  });

  it('onUpdate fires press on sufficient depression', () => {
    trait.onAttach(node, ctx as any);
    trait.onUpdate(node, ctx as any, 0.016); // capture initial pos

    // Simulate depression exceeding trigger point
    ctx.physics.getBodyPosition = () => ({ x: 0, y: 0, z: 0.008 }); // 80% of 0.01
    trait.onUpdate(node, ctx as any, 0.016);
    const pressEvents = ctx._events.filter((e: any) => e.type === 'ui_press_start');
    expect(pressEvents.length).toBe(1);
  });

  it('onUpdate fires release on return', () => {
    trait.onAttach(node, ctx as any);
    trait.onUpdate(node, ctx as any, 0.016);

    // Press
    ctx.physics.getBodyPosition = () => ({ x: 0, y: 0, z: 0.008 });
    trait.onUpdate(node, ctx as any, 0.016);

    // Release
    ctx.physics.getBodyPosition = () => ({ x: 0, y: 0, z: 0.001 }); // 10% < 30%
    trait.onUpdate(node, ctx as any, 0.016);
    const releaseEvents = ctx._events.filter((e: any) => e.type === 'ui_press_end');
    expect(releaseEvents.length).toBe(1);
  });
});
