import { describe, it, expect, vi } from 'vitest';
import { softBodyHandler } from '../traits/SoftBodyTrait';

describe('SoftBody Autonomy (Phase 10.5)', () => {
  it('should initialize state correctly', () => {
    const mockNode = {
      properties: { meshData: { positions: [0, 0, 0], indices: [0], volume: 0.5 } },
    };
    const mockConfig = softBodyHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;
    softBodyHandler.onAttach!(mockNode as any, mockConfig, mockContext);
    const state = (mockNode as any).__softBodyState;
    expect(state).toBeDefined();
    expect(state.restVolume).toBe(0.5);
  });

  it('should create particles from mesh positions', () => {
    const mockNode = {
      properties: { meshData: { positions: [0, 0, 0, 1, 1, 1], indices: [0], volume: 1.0 } },
    };
    const mockConfig = softBodyHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;
    softBodyHandler.onAttach!(mockNode as any, mockConfig, mockContext);
    const state = (mockNode as any).__softBodyState;
    expect(state.solver.getParticles()).toHaveLength(2);
  });

  it('should create constraints from mesh indices', () => {
    const mockNode = {
      properties: {
        meshData: {
          positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
          indices: [0, 1, 2],
          volume: 1.0,
        },
      },
    };
    const mockConfig = softBodyHandler.defaultConfig;
    const mockContext = { emit: vi.fn() } as any;
    softBodyHandler.onAttach!(mockNode as any, mockConfig, mockContext);
    const state = (mockNode as any).__softBodyState;
    expect(state.solver.getConstraints()).toHaveLength(3);
  });
});
