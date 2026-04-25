import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createMockNode,
  createMockContext,
  attachTrait,
  updateTrait,
  sendEvent,
} from './traitTestHelpers';

// Mock SoftBodySolver
vi.mock('@holoscript/engine/physics/SoftBodySolver', () => ({
  SoftBodySolver: class MockSoftBodySolver {
    particles: any[] = [];
    constraints: any[] = [];
    initialize = vi.fn();
    step = vi.fn();
    addParticle = vi.fn();
    addConstraint = vi.fn();
    getParticles = vi.fn().mockReturnValue([]);
    getDeformedVertices = vi.fn().mockReturnValue(new Float32Array(12));
    reset = vi.fn();
  },
}));

import { softBodyHandler } from '../SoftBodyTrait';

describe('SoftBodyTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    stiffness: 0.5,
    damping: 0.05,
    mass: 1.0,
    pressure: 1.0,
    volume_conservation: 0.9,
    collision_margin: 0.01,
    solver_iterations: 10,
    tetrahedral: false,
    surface_stiffness: 0.5,
    bending_stiffness: 0.3,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('jelly');
    (node as any).properties = { position: [0, 1, 0] };
    ctx = createMockContext();
    attachTrait(softBodyHandler, node, cfg, ctx);
  });

  it('initializes state on attach', () => {
    const s = (node as any).__softBodyState;
    expect(s).toBeDefined();
    expect(s.isSimulating).toBe(true);
    expect(s.solver).toBeDefined();
  });

  it('sets deformationAmount to 0 initially', () => {
    const s = (node as any).__softBodyState;
    expect(s.deformationAmount).toBe(0);
  });

  it('cleans up on detach', () => {
    softBodyHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__softBodyState).toBeUndefined();
  });

  it('has correct handler name', () => {
    expect(softBodyHandler.name).toBe('soft_body');
  });

  it('has correct default config', () => {
    expect((softBodyHandler.defaultConfig as any).stiffness).toBe(0.5);
    expect((softBodyHandler.defaultConfig as any).mass).toBe(1.0);
    expect((softBodyHandler.defaultConfig as any).solver_iterations).toBe(10);
  });

  it('does not throw on update', () => {
    updateTrait(softBodyHandler, node, cfg, ctx, 0.016);
  });

  it('does not throw on detach without state', () => {
    const emptyNode = createMockNode('empty');
    softBodyHandler.onDetach?.(emptyNode as any, cfg as any, ctx as any);
  });

  it('handles reset event', () => {
    sendEvent(softBodyHandler, node, cfg, ctx, { type: 'soft_body_reset' });
    // Should not throw
  });

  it('handles deform event', () => {
    sendEvent(softBodyHandler, node, cfg, ctx, {
      type: 'soft_body_deform',
      point: [0, 0, 0],
      force: [1, 0, 0],
    });
  });
});
