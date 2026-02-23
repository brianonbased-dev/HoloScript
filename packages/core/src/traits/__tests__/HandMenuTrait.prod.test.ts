/**
 * HandMenuTrait — Production Test Suite
 *
 * handMenuHandler uses a module-level Map<string, SpringAnimator> keyed by node.id.
 * SpringAnimator and SpringPresets are mocked to avoid real physics computation.
 *
 * Key behaviours:
 * 1. defaultValue — hand=left, trigger=palm_up, offset={0,0.2,0}, scale=1
 * 2. onAttach — creates SpringAnimator, stores it in menuSprings; sets scale=0 + opacity=0
 * 3. onDetach — removes node entry from menuSprings
 * 4. onUpdate — no-op when !context.vr OR !vr.hands
 * 5. onUpdate — no-op when spring not found (after detach)
 * 6. onUpdate — when hand missing: spring driven to 0, updates scale+opacity
 * 7. onUpdate — when hand present: position lerped toward hand.position+offset;
 *               scale and opacity set from spring visibility
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ────────────────────────────────────────────────────────────────────

let _springInstance: { setTarget: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };

vi.mock('../../animation/SpringAnimator', () => {
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

// UIHandMenuTrait type — just a shape, no implementation needed
vi.mock('../UITraits', () => ({ UIHandMenuTrait: {} }));

import { handMenuHandler } from '../HandMenuTrait';

// ─── helpers ─────────────────────────────────────────────────────────────────

let _nodeId = 0;
function makeNode(withProps = true) {
  return {
    id: `hand_node_${++_nodeId}`,
    properties: withProps ? { position: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } : undefined,
  };
}

function makeCtx(handData?: { left?: { position: { x: number; y: number; z: number } } }) {
  return {
    emit: vi.fn(),
    vr: handData !== undefined
      ? { headset: { position: { x: 0, y: 0, z: 0 } }, hands: handData }
      : undefined,
  };
}

const defaultConfig: any = {
  hand: 'left',
  trigger: 'palm_up',
  offset: { x: 0, y: 0.2, z: 0 },
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

// ─── defaultValue ─────────────────────────────────────────────────────────────

describe('handMenuHandler.defaultValue', () => {
  const d = (handMenuHandler as any).defaultValue;
  it('hand = left', () => expect(d.hand).toBe('left'));
  it('trigger = palm_up', () => expect(d.trigger).toBe('palm_up'));
  it('offset = {0,0.2,0}', () => expect(d.offset).toEqual({ x: 0, y: 0.2, z: 0 }));
  it('scale = 1', () => expect(d.scale).toBe(1));
});

// ─── onAttach ─────────────────────────────────────────────────────────────────

describe('handMenuHandler.onAttach', () => {
  it('sets node.properties.scale to {0,0,0}', () => {
    const { node } = attach();
    expect((node.properties as any).scale).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('sets node.properties.opacity to 0', () => {
    const { node } = attach();
    expect((node.properties as any).opacity).toBe(0);
  });

  it('creates a SpringAnimator for the node', () => {
    attach();
    expect(_springInstance).toBeDefined();
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('handMenuHandler.onDetach', () => {
  it('removes node from menuSprings (onUpdate becomes no-op)', () => {
    const { node, ctx, config } = attach();
    handMenuHandler.onDetach!(node as any, config, ctx as any);
    // After detach, onUpdate should be a no-op (spring not found — no throw expected)
    const ctx2 = makeCtx({ left: { position: { x: 0, y: 0, z: 0 } } });
    expect(() => handMenuHandler.onUpdate!(node as any, config, ctx2 as any, 0.016)).not.toThrow();
  });
});

// ─── onUpdate — guard conditions ─────────────────────────────────────────────

describe('handMenuHandler.onUpdate — guards', () => {
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

// ─── onUpdate — hand absent ───────────────────────────────────────────────────

describe('handMenuHandler.onUpdate — hand absent (no left hand)', () => {
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
    expect((node.properties as any).scale).toEqual({ x: expectedS, y: expectedS, z: expectedS });
  });

  it('updates opacity from spring value when hand absent', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    freshSpring.update.mockReturnValue(0.3);
    const ctx = makeCtx({ left: undefined });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node.properties as any).opacity).toBeCloseTo(0.3, 5);
  });
});

// ─── onUpdate — hand present ──────────────────────────────────────────────────

describe('handMenuHandler.onUpdate — hand present', () => {
  it('calls spring.setTarget(1) when hand is present', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    const ctx = makeCtx({ left: { position: { x: 0, y: 1, z: 0 } } });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect(freshSpring.setTarget).toHaveBeenCalledWith(1);
  });

  it('lerps position toward hand.position + offset', () => {
    const { node, config } = attach();
    // node starts at {0,0,0}; hand at {1,0,0}; offset {0,0.2,0} → target {1,0.2,0}
    const ctx = makeCtx({ left: { position: { x: 1, y: 0, z: 0 } } });
    // delta=0.1, lerpFactor = min(1, 10*0.1) = 1 → position = target immediately
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.1);
    expect((node.properties as any).position.x).toBeCloseTo(1, 4);
    expect((node.properties as any).position.y).toBeCloseTo(0.2, 4);
  });

  it('sets scale from spring visibility * config.scale', () => {
    const { node, config } = attach({ ...defaultConfig, scale: 2 });
    const freshSpring = _springInstance;
    freshSpring.update.mockReturnValue(0.5);
    const ctx = makeCtx({ left: { position: { x: 0, y: 0, z: 0 } } });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    const expectedS = 0.5 * 2; // 1.0
    expect((node.properties as any).scale.x).toBeCloseTo(expectedS, 4);
  });

  it('sets opacity from spring visibility', () => {
    const { node, config } = attach();
    const freshSpring = _springInstance;
    freshSpring.update.mockReturnValue(0.75);
    const ctx = makeCtx({ left: { position: { x: 0, y: 0, z: 0 } } });
    handMenuHandler.onUpdate!(node as any, config, ctx as any, 0.016);
    expect((node.properties as any).opacity).toBeCloseTo(0.75, 4);
  });

  it('uses config.hand to select the right hand', () => {
    const { node } = attach({ ...defaultConfig, hand: 'right' });
    const freshSpring = _springInstance;
    // No right hand — should target 0
    const ctx = makeCtx({ left: { position: { x: 0, y: 0, z: 0 } } }); // only has left
    handMenuHandler.onUpdate!(node as any, { ...defaultConfig, hand: 'right' }, ctx as any, 0.016);
    expect(freshSpring.setTarget).toHaveBeenCalledWith(0);
  });
});
