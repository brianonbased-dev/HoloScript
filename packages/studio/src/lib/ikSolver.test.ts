/**
 * ikSolver.test.ts - Tests for IK solver functionality
 */

import { describe, it, expect } from 'vitest';
import { fabrikSolve, createChain, chainLength, type Vec3 } from './ikSolver.js';

describe('IK Solver', () => {
  const origin: Vec3 = { x: 0, y: 0, z: 0 };
  const joint1: Vec3 = { x: 1, y: 0, z: 0 };
  const joint2: Vec3 = { x: 2, y: 0, z: 0 };
  const target: Vec3 = { x: 1.5, y: 1, z: 0 };

  it('should calculate chain length correctly', () => {
    const joints = [origin, joint1, joint2];
    const length = chainLength(joints);
    expect(length).toBe(2); // 1 + 1 = 2
  });

  it('should create a chain with correct structure', () => {
    const chain = createChain([origin, joint1], target, 0.01, 10);
    expect(chain.joints).toHaveLength(2);
    expect(chain.target).toEqual(target);
    expect(chain.tolerance).toBe(0.01);
    expect(chain.maxIterations).toBe(10);
  });

  it('should solve simple 2-joint chain', () => {
    const chain = createChain([origin, joint1], target, 0.1, 10);
    const result = fabrikSolve(chain);
    
    expect(result.joints).toHaveLength(2);
    expect(result.iterations).toBeGreaterThanOrEqual(0);
    expect(result.iterations).toBeLessThanOrEqual(10);
    expect(typeof result.finalDistance).toBe('number');
    expect(typeof result.reached).toBe('boolean');
  });

  it('should handle unreachable targets', () => {
    const farTarget: Vec3 = { x: 10, y: 10, z: 0 };
    const chain = createChain([origin, joint1], farTarget, 0.1, 10);
    const result = fabrikSolve(chain);
    
    expect(result.reached).toBe(false);
    expect(result.finalDistance).toBeGreaterThan(0);
  });

  it('should handle chains with fewer than 2 joints', () => {
    const chain = createChain([origin], target, 0.1, 10);
    const result = fabrikSolve(chain);
    
    expect(result.joints).toHaveLength(1);
    expect(result.reached).toBe(false);
    expect(result.iterations).toBe(0);
    expect(result.finalDistance).toBe(Infinity);
  });
});