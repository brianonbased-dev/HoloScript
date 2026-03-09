import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flowFieldHandler } from '../FlowFieldTrait';

// ─── Mock NavigationEngine ────────────────────────────────────────────────────
// FlowFieldTrait calls getNavigationEngine() from the runtime module.
// We mock the module so we can control what sampleDirection returns.

const mockSampleDirection = vi.fn(() => [1, 0, 0]); // default: move along +X

vi.mock('../../runtime/NavigationEngine', () => ({
  getNavigationEngine: vi.fn(() => ({
    sampleDirection: mockSampleDirection,
  })),
}));

// ─── helpers ────────────────────────────────────────────────────────────────

type FFConfig = NonNullable<Parameters<typeof flowFieldHandler.onAttach>[1]>;

function mkCfg(o: Partial<FFConfig> = {}): FFConfig {
  return { ...flowFieldHandler.defaultConfig!, ...o };
}

function mkNode(id = 'ff-node', position: [number, number, number] = [0, 0, 0]) {
  return { id, properties: { position, rotation: [0, 0, 0] } } as any;
}

function mkCtx() {
  const emitted: any[] = [];
  return {
    emitted,
    emit: vi.fn((t: string, p: any) => emitted.push({ type: t, payload: p })) as any,
  };
}

function attach(cfg = mkCfg(), node = mkNode(), ctx = mkCtx()) {
  flowFieldHandler.onAttach!(node, cfg, ctx as any);
  ctx.emitted.length = 0;
  return { node, ctx, cfg };
}

beforeEach(() => {
  mockSampleDirection.mockReturnValue([1, 0, 0]);
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe('flowFieldHandler — defaultConfig', () => {
  it('destinationId = empty string', () =>
    expect(flowFieldHandler.defaultConfig?.destinationId).toBe(''));
  it('speed = 3.0', () => expect(flowFieldHandler.defaultConfig?.speed).toBe(3.0));
  it('steeringWeight = 0.8', () =>
    expect(flowFieldHandler.defaultConfig?.steeringWeight).toBe(0.8));
  it('stopDistance = 0.5', () => expect(flowFieldHandler.defaultConfig?.stopDistance).toBe(0.5));
});

describe('flowFieldHandler — onAttach', () => {
  it('creates __flowFieldState', () => {
    const { node } = attach();
    expect((node as any).__flowFieldState).toBeDefined();
  });
  it('currentDirection = [0,0,0]', () => {
    const { node } = attach();
    expect((node as any).__flowFieldState.currentDirection).toEqual([0, 0, 0]);
  });
  it('isMoving = false', () => {
    const { node } = attach();
    expect((node as any).__flowFieldState.isMoving).toBe(false);
  });
});

describe('flowFieldHandler — onDetach', () => {
  it('removes __flowFieldState', () => {
    const cfg = mkCfg({ destinationId: 'dest' });
    const node = mkNode();
    const ctx = mkCtx();
    flowFieldHandler.onAttach!(node, cfg, ctx as any);
    flowFieldHandler.onDetach!(node);
    expect((node as any).__flowFieldState).toBeUndefined();
  });
});

describe('flowFieldHandler — onUpdate: no-op guards', () => {
  it('no position update when destinationId is empty', () => {
    const cfg = mkCfg({ destinationId: '' });
    const node = mkNode('nd1', [0, 0, 0]);
    const ctx = mkCtx();
    flowFieldHandler.onAttach!(node, cfg, ctx as any);
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    expect(node.properties.position).toEqual([0, 0, 0]);
  });

  it('no position update when no state', () => {
    const node = mkNode();
    const ctx = mkCtx();
    expect(() =>
      flowFieldHandler.onUpdate!(node, mkCfg({ destinationId: 'dest' }), ctx as any, 0.1)
    ).not.toThrow();
  });
});

describe('flowFieldHandler — onUpdate: movement', () => {
  it('updates position along flow direction', () => {
    mockSampleDirection.mockReturnValue([1, 0, 0]); // +X direction
    const cfg = mkCfg({ destinationId: 'dest', speed: 10, steeringWeight: 1.0 });
    const { node, ctx } = attach(cfg, mkNode('nd2', [0, 0, 0]));
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    // direction=[1,0,0] normalized, speed=10, delta=0.1 → x += 1.0
    expect((node.properties.position as number[])[0]).toBeCloseTo(1.0, 5);
  });

  it('sets isMoving=true when flow direction is non-zero', () => {
    mockSampleDirection.mockReturnValue([0, 0, 1]);
    const cfg = mkCfg({ destinationId: 'dest', steeringWeight: 1.0 });
    const { node, ctx } = attach(cfg);
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    expect((node as any).__flowFieldState.isMoving).toBe(true);
  });

  it('sets isMoving=false when flow direction is zero', () => {
    mockSampleDirection.mockReturnValue([0, 0, 0]);
    const cfg = mkCfg({ destinationId: 'dest', steeringWeight: 1.0 });
    const { node, ctx } = attach(cfg);
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    expect((node as any).__flowFieldState.isMoving).toBe(false);
  });

  it('blends currentDirection with flow using steeringWeight', () => {
    // steeringWeight=0.5: new direction = 0.5*current + 0.5*flow
    // current=[0,0,0], flow=[1,0,0] → blended=[0.5,0,0] → normalized=[1,0,0]
    mockSampleDirection.mockReturnValue([1, 0, 0]);
    const cfg = mkCfg({ destinationId: 'dest', steeringWeight: 0.5, speed: 1 });
    const { node, ctx } = attach(cfg);
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 1.0);
    // Blended [0.5, 0, 0] normalized → [1, 0, 0], position += speed*1 = 1
    expect((node.properties.position as number[])[0]).toBeCloseTo(1.0, 5);
  });

  it('updates rotation to face movement direction (atan2)', () => {
    mockSampleDirection.mockReturnValue([1, 0, 0]); // pure +X
    const cfg = mkCfg({ destinationId: 'dest', steeringWeight: 1.0, speed: 5 });
    const { node, ctx } = attach(cfg);
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 0.1);
    // atan2(1, 0) = 90°
    const rotY = (node.properties.rotation as number[])[1];
    expect(rotY).toBeCloseTo(90, 0);
  });

  it('moves in -Z when flow is [0,0,-1]', () => {
    mockSampleDirection.mockReturnValue([0, 0, -1]);
    const cfg = mkCfg({ destinationId: 'dest', speed: 5, steeringWeight: 1.0 });
    const { node, ctx } = attach(cfg, mkNode('nd3', [0, 0, 10]));
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 1.0);
    // z should decrease
    expect((node.properties.position as number[])[2]).toBeCloseTo(5, 5);
  });

  it('y position changes when flow has vertical component', () => {
    mockSampleDirection.mockReturnValue([0, 1, 0]); // upward
    const cfg = mkCfg({ destinationId: 'dest', speed: 2, steeringWeight: 1.0 });
    const { node, ctx } = attach(cfg);
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 1.0);
    expect((node.properties.position as number[])[1]).toBeCloseTo(2, 5);
  });

  it('accumulates steering over multiple frames', () => {
    // steeringWeight < 1 → direction blends across frames
    mockSampleDirection.mockReturnValue([1, 0, 0]);
    const cfg = mkCfg({ destinationId: 'dest', speed: 0, steeringWeight: 0.5 });
    const { node, ctx } = attach(cfg);
    // Frame 1: current=[0,0,0], blend=[0.5,0,0]
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const dir1 = [...(node as any).__flowFieldState.currentDirection];
    // Frame 2: current=[0.5,0,0], blend=[0.75,0,0]
    flowFieldHandler.onUpdate!(node, cfg, ctx as any, 0.016);
    const dir2 = (node as any).__flowFieldState.currentDirection;
    // x component should grow towards 1
    expect((dir2 as number[])[0]).toBeGreaterThan((dir1 as number[])[0]);
  });
});
