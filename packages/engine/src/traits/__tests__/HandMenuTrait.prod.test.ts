/**
 * HandMenuTrait â€” Production Test Suite
 *
 * handMenuHandler uses a module-level Map<string, SpringAnimator> keyed by node.id.
 * SpringAnimator and SpringPresets are mocked to avoid real physics computation.
 *
 * Key behaviours:
 * 1. defaultValue â€” hand=left, trigger=palm_up, offset={0,0.2,0}, scale=1
 * 2. onAttach â€” creates SpringAnimator, stores it in menuSprings; sets scale=0 + opacity=0
 * 3. onDetach â€” removes node entry from menuSprings
 * 4. onUpdate â€” no-op when !context.vr OR !vr.hands
 * 5. onUpdate â€” no-op when spring not found (after detach)
 * 6. onUpdate â€” when hand missing: spring driven to 0, updates scale+opacity
 * 7. onUpdate â€” when hand present: position lerped toward hand.position+offset;
 *               scale and opacity set from spring visibility
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// â”€â”€â”€ Mocks â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _springInstance: { setTarget: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

vi.mock('@holoscript/engine/animation/SpringAnimator', () => {
  function SpringAnimator(_initial: number, _preset: any) {
    _springInstance = {
      setTarget: vi.fn(),
      update: vi.fn().mockReturnValue(0.5),
    };
    return _springInstance;
  }
  const SpringPresets = { gentle: { stiffness: 80, damping: 12 } };
  return { SpringAnimator, SpringPresets };
});

// UIHandMenuTrait type â€” just a shape, no implementation needed
vi.mock('../UITraits', () => ({ UIHandMenuTrait: {} }));

import { handMenuHandler } from '../HandMenuTrait';

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

let _nodeId = 0;
function makeNode(withProps = true) {
  return {
    id: `hand_node_${++_nodeId}`,
    properties: withProps
      ? { position: [0, 0, 0], scale: [1, 1, 1 ] }
      : undefined,
  };
}

function makeCtx(handData?: { left?: { position: [number, number, number] } }) {
  return {
    emit: vi.fn(),
    vr:
      handData !== undefined
        ? { headset: { position: [0, 0, 0] }, hands: handData }
        : undefined,
  };
}

const defaultConfig: any = {
  hand: 'left',
  trigger: 'palm_up',
  offset: [0, 0.2, 0 ],
  scale: 1,
};

function attach(cfg: any = defaultConfig) {
  const node = makeNode();
  const ctx = makeCtx();
  handMenuHandler.onAttach!(node as any, cfg, ctx as any);
  return { node, ctx, config: cfg };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// â”€â”€â”€ defaultValue â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('handMenuHandler.defaultValue', () => {
  const d = (handMenuHandler as any).defaultValue;
  it('hand = left', () => expect(d.hand).toBe('left'));
  it('trigger = palm_up', () => expect(d.trigger).toBe('palm_up'));
  it('offset = {0,0.2,0}', () => expect(d.offset).toEqual([0, 0.2, 0 ]));
  it('scale = 1', () => expect(d.scale).toBe(1));
});

// â”€â”€â”€ onAttach â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('handMenuHandler.onAttach', () => {
  it('sets node.properties.scale to {0,0,0}', () => {
    const { node } = attach();
    expect(node.properties!.scale).toEqual([0, 0, 0 ]);
  });

  it('sets node.properties.opacity to 0', () => {
    const { node } = attach();
    expect(node.properties!.opacity).toBe(0);
  });

  it('creates a SpringAnimator for the node', () => {
    attach();
    expect(_springInstance).toBeDefined();
  });
});

// â”€â”€â”€ onDetach â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('handMenuHandler.onDetach', () => {
  it('removes node from menuSprings (onUpdate becomes no-op)', () => {
    const { node, ctx, config } = attach();
    handMenuHandler.onDetach!(node as any, config, ctx as any);
    // After detach, onUpdate should be a no-op (spring not found â€” no throw expected)
    const ctx2 = makeCtx({ left: { position: [0, 0, 0] } });
    expect(() => handMenuHandler.onUpdate!(node as any, config, ctx2 as any, 0.016)).not.toThrow();
  });
});

// â”€â”€â”€ onUpdate â€” guard conditions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('handMenuHandler.onUpdate â€” guards', () => {
  it('no-op when context has no vr', () => {
    const { node, config } = attach();
    const ctx = { emit: vi.fn() }; // no .vr
    expect(() => handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016)).not.toThrow();
  });

  it('no-op when vr.hands is undefined', () => {
    const { node, config } = attach();
    const ctx = { emit: vi.fn(), vr: { headset: {}, hands: undefined } };
    expect(() => handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016)).not.toThrow();
  });
});

// â”€â”€â”€ onUpdate â€” hand absent â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('handMenuHandler.onUpdate â€” hand absent (no left hand)', () => {
  it('calls spring.setTarget(0) when hand is missing', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    const ctx = makeCtx({ left: undefined }); // left hand missing
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(freshSpring.setTarget).toHaveBeenCalledWith(0);
  });

  it('updates scale from spring value when hand absent', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    freshSpring.update.mockReturnValue(0.4);
    const ctx = makeCtx({ left: undefined });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const expectedS = 0.4 * (config.scale || 1);
    expect(node.properties!.scale).toEqual([expectedS, expectedS, expectedS ]);
  });

  it('updates opacity from spring value when hand absent', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    freshSpring.update.mockReturnValue(0.3);
    const ctx = makeCtx({ left: undefined });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(node.properties!.opacity).toBeCloseTo(0.3, 5);
  });
});

// â”€â”€â”€ onUpdate â€” hand present â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('handMenuHandler.onUpdate â€” hand present', () => {
  it('calls spring.setTarget(1) when hand is present', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    const ctx = makeCtx({ left: { position: [0, 1, 0] } });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(freshSpring.setTarget).toHaveBeenCalledWith(1);
  });

  it('lerps position toward hand.position + offset', () => {
    const { node, config } = attach();
    // node starts at {0,0,0}; hand at {1,0,0}; offset {0,0.2,0} â†’ target {1,0.2,0}
    const ctx = makeCtx({ left: { position: [1, 0, 0] } });
    // delta=0.1, lerpFactor = min(1, 10*0.1) = 1 â†’ position = target immediately
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect(node.properties!.position[0]).toBeCloseTo(1, 4);
    expect(node.properties!.position[1]).toBeCloseTo(0.2, 4);
  });

  it('sets scale from spring visibility * config.scale', () => {
    const { node, config } = attach({ ...defaultConfig, scale: 2 });
    const freshSpring = _springInstance;
    freshSpring.update.mockReturnValue(0.5);
    const ctx = makeCtx({ left: { position: [0, 0, 0] } });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const expectedS = 0.5 * 2; // 1.0
    expect(node.properties!.scale[0]).toBeCloseTo(expectedS, 4);
  });

  it('sets opacity from spring visibility', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    freshSpring.update.mockReturnValue(0.75);
    const ctx = makeCtx({ left: { position: [0, 0, 0] } });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(node.properties!.opacity).toBeCloseTo(0.75, 4);
  });

  it('uses config.hand to select the right hand', () => {
    const { node } = attach({ ...defaultConfig, hand: 'right' });
    const freshSpring = _springInstance;
    // No right hand â€” should target 0
    const ctx = makeCtx({ left: { position: [0, 0, 0] } }); // only has left
    handMenuHandler.onUpdate!(node as any, { ...defaultConfig, hand: 'right' }, ctx as any, 0.016);
    expect(freshSpring.setTarget).toHaveBeenCalledWith(0);
  });
});
