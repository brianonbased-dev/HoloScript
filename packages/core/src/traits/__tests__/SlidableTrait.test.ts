import { describe, it, expect, beforeEach } from 'vitest';
import { SlidableTrait } from '../SlidableTrait';

function createSlidableMockContext() {
  const events: Array<{ type: string; data: any }> = [];
  return {
    emit: (type: string, data: any) => events.push({ type, data }),
    physics: {
      getBodyPosition: (_id: string) => ({ x: 0, y: 0, z: 0 }),
    },
    haptics: {
      rumble: (_hand: string, _intensity: number) => {},
    },
    _events: events,
  };
}

describe('SlidableTrait', () => {
  let trait: SlidableTrait;
  let ctx: ReturnType<typeof createSlidableMockContext>;
  let node: any;

  beforeEach(() => {
    trait = new SlidableTrait();
    ctx = createSlidableMockContext();
    node = {
      id: 'slider1',
      properties: {
        axis: 'x',
        length: 0.1,
        position: { x: 0, y: 0, z: 0 },
        value: 0,
      },
    };
  });

  it('has correct name', () => {
    expect(trait.name).toBe('slidable');
  });

  it('onAttach emits prismatic constraint', () => {
    trait.onAttach(node, ctx as any);
    expect(ctx._events.length).toBe(1);
    expect(ctx._events[0].type).toBe('physics_add_constraint');
    expect(ctx._events[0].data.type).toBe('prismatic');
    expect(ctx._events[0].data.min).toBe(-0.05);
    expect(ctx._events[0].data.max).toBe(0.05);
  });

  it('onUpdate captures initial position and no event at center', () => {
    trait.onAttach(node, ctx as any);
    trait.onUpdate(node, ctx as any, 0.016);
    // At center (0), value = (0 + 0.05) / 0.1 = 0.5, which differs from lastValue (0) by 0.5 > 0.01
    const valueEvents = ctx._events.filter((e: any) => e.type === 'ui_value_change');
    expect(valueEvents.length).toBe(1);
    expect(valueEvents[0].data.value).toBeCloseTo(0.5);
  });

  it('onUpdate emits value change on position change', () => {
    trait.onAttach(node, ctx as any);
    trait.onUpdate(node, ctx as any, 0.016); // capture initial + emit for 0.5

    // Move slider to max position
    ctx.physics.getBodyPosition = () => ({ x: 0.05, y: 0, z: 0 }); // max position
    trait.onUpdate(node, ctx as any, 0.016);
    const valueEvents = ctx._events.filter((e: any) => e.type === 'ui_value_change');
    expect(valueEvents.length).toBe(2);
    expect(valueEvents[1].data.value).toBeCloseTo(1.0);
  });

  it('value is clamped between 0 and 1', () => {
    trait.onAttach(node, ctx as any);
    trait.onUpdate(node, ctx as any, 0.016);

    // Position beyond max
    ctx.physics.getBodyPosition = () => ({ x: 0.2, y: 0, z: 0 });
    trait.onUpdate(node, ctx as any, 0.016);
    expect(node.properties.value).toBeLessThanOrEqual(1);
  });

  it('supports y axis', () => {
    node.properties.axis = 'y';
    trait.onAttach(node, ctx as any);
    const constraint = ctx._events[0].data;
    expect(constraint.axis).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('supports z axis', () => {
    node.properties.axis = 'z';
    trait.onAttach(node, ctx as any);
    const constraint = ctx._events[0].data;
    expect(constraint.axis).toEqual({ x: 0, y: 0, z: 1 });
  });
});
