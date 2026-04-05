import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SoftBodyGrabController } from '@holoscript/core';

// Mock PBDSolverCPU
function mockSolver(vertexCount = 9) {
  const positions = new Float32Array(vertexCount * 3);
  // Place vertices in a ~0.1 radius grid around origin
  for (let i = 0; i < vertexCount; i++) {
    positions[i * 3] = (i % 3) * 0.05;
    positions[i * 3 + 1] = Math.floor(i / 3) * 0.05;
    positions[i * 3 + 2] = 0;
  }
  return {
    getState: vi.fn(() => ({ positions })),
    pinVertex: vi.fn(),
    unpinVertex: vi.fn(),
    updateAttachmentTarget: vi.fn(),
  };
}

describe('SoftBodyGrabController', () => {
  let ctrl: SoftBodyGrabController;
  beforeEach(() => {
    ctrl = new SoftBodyGrabController();
  });

  it('isGrabbing returns false initially', () => {
    expect(ctrl.isGrabbing('leftHand')).toBe(false);
  });

  it('getActiveGrabs returns empty initially', () => {
    expect(ctrl.getActiveGrabs()).toHaveLength(0);
  });

  it('grabStart marks hand as grabbing', () => {
    const solver = mockSolver();
    ctrl.grabStart('leftHand', { x: 0, y: 0, z: 0 }, solver as any);
    expect(ctrl.isGrabbing('leftHand')).toBe(true);
    expect(ctrl.getActiveGrabs()).toContain('leftHand');
  });

  it('grabStart calls pinVertex on solver', () => {
    const solver = mockSolver();
    ctrl.grabStart('leftHand', { x: 0, y: 0, z: 0 }, solver as any);
    expect(solver.pinVertex).toHaveBeenCalled();
  });

  it('grabStart does not grab if no vertices in radius', () => {
    const solver = mockSolver();
    // Hand far away from all vertices
    ctrl.grabStart('leftHand', { x: 100, y: 100, z: 100 }, solver as any);
    expect(ctrl.isGrabbing('leftHand')).toBe(false);
  });

  it('grabUpdate calls updateAttachmentTarget', () => {
    const solver = mockSolver();
    ctrl.grabStart('leftHand', { x: 0, y: 0, z: 0 }, solver as any);
    ctrl.grabUpdate('leftHand', { x: 0.5, y: 0, z: 0 });
    expect(solver.updateAttachmentTarget).toHaveBeenCalled();
  });

  it('grabUpdate on non-grabbed hand does nothing', () => {
    ctrl.grabUpdate('noHand', { x: 0, y: 0, z: 0 });
    // No error
  });

  it('grabEnd releases grab', () => {
    const solver = mockSolver();
    ctrl.grabStart('leftHand', { x: 0, y: 0, z: 0 }, solver as any);
    ctrl.grabEnd('leftHand');
    expect(ctrl.isGrabbing('leftHand')).toBe(false);
    expect(solver.unpinVertex).toHaveBeenCalled();
  });

  it('grabEnd on non-grabbed hand is safe', () => {
    expect(() => ctrl.grabEnd('noHand')).not.toThrow();
  });

  it('releaseAll releases all grabs', () => {
    const solver = mockSolver();
    ctrl.grabStart('leftHand', { x: 0, y: 0, z: 0 }, solver as any);
    ctrl.grabStart('rightHand', { x: 0.05, y: 0, z: 0 }, solver as any);
    ctrl.releaseAll();
    expect(ctrl.getActiveGrabs()).toHaveLength(0);
  });

  it('double-grab same hand releases previous first', () => {
    const solver = mockSolver();
    ctrl.grabStart('leftHand', { x: 0, y: 0, z: 0 }, solver as any);
    ctrl.grabStart('leftHand', { x: 0.05, y: 0, z: 0 }, solver as any);
    expect(ctrl.getActiveGrabs()).toHaveLength(1);
    expect(solver.unpinVertex).toHaveBeenCalled();
  });

  it('custom config applies', () => {
    const ctrl2 = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 2 });
    const solver = mockSolver(9);
    ctrl2.grabStart('hand', { x: 0, y: 0, z: 0 }, solver as any);
    // With large radius, should find vertices but cap at 2
    expect(solver.pinVertex.mock.calls.length).toBeLessThanOrEqual(2);
  });
});
