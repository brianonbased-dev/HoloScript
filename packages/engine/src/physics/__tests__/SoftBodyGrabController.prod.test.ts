import { describe, it, expect, beforeEach } from 'vitest';
import { SoftBodyGrabController, GrabConfig } from '..';
import type { IVector3 } from '@holoscript/core';

// =============================================================================
// MOCK PBDSolverCPU
// =============================================================================

interface PinCall {
  index: number;
  target: IVector3;
  compliance: number;
}
interface UnpinCall {
  index: number;
}
interface AttachCall {
  index: number;
  target: IVector3;
}

function makeSolver(positions: number[]) {
  const pins: PinCall[] = [];
  const unpins: UnpinCall[] = [];
  const attachUpdates: AttachCall[] = [];

  const solver = {
    getState: () => ({ positions: new Float32Array(positions) }),
    pinVertex(index: number, target: IVector3, compliance: number) {
      pins.push({ index, target, compliance });
    },
    unpinVertex(index: number) {
      unpins.push({ index });
    },
    updateAttachmentTarget(index: number, target: IVector3) {
      attachUpdates.push({ index, target });
    },
    _pins: pins,
    _unpins: unpins,
    _attachUpdates: attachUpdates,
  };
  return solver as unknown as import('../PBDSolver').PBDSolverCPU & {
    _pins: PinCall[];
    _unpins: UnpinCall[];
    _attachUpdates: AttachCall[];
  };
}

// Build a flat Float32Array of N vertices centred near origin
function gridPositions(n: number, spacing = 0.1): number[] {
  const arr: number[] = [];
  for (let i = 0; i < n; i++) {
    arr.push(i * spacing, 0, 0);
  }
  return arr;
}

// =============================================================================
// TESTS
// =============================================================================

describe('SoftBodyGrabController — Production Tests', () => {
  // -------------------------------------------------------------------------
  // Constructor / defaults
  // -------------------------------------------------------------------------
  describe('constructor', () => {
    it('initialises with no active grabs', () => {
      const ctrl = new SoftBodyGrabController();
      expect(ctrl.getActiveGrabs()).toHaveLength(0);
      expect(ctrl.isGrabbing('hand_left')).toBe(false);
    });

    it('accepts partial config override', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 0.5, maxVertices: 4 });
      // Constructor succeeds — verify grab respects radius
      const positions = gridPositions(10, 0.1); // vertices at 0, 0.1, … 0.9
      const solver = makeSolver(positions);
      // Only vertices within 0.5 units should be grabbed
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      // At least 4 pins (capped by maxVertices: 4) — all within 0.5
      expect(solver._pins.length).toBeLessThanOrEqual(4);
    });
  });

  // -------------------------------------------------------------------------
  // grabStart
  // -------------------------------------------------------------------------
  describe('grabStart', () => {
    it('creates pin constraints for nearby vertices', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 0.2, maxVertices: 8 });
      const positions = gridPositions(10, 0.05); // 0, 0.05, 0.1, … 0.45
      const solver = makeSolver(positions);
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      expect(solver._pins.length).toBeGreaterThan(0);
    });

    it('registers the hand as active', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0 });
      const solver = makeSolver(gridPositions(3, 0.1));
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      expect(ctrl.isGrabbing('h1')).toBe(true);
      expect(ctrl.getActiveGrabs()).toContain('h1');
    });

    it('pins at most maxVertices vertices', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 100, maxVertices: 3 });
      const solver = makeSolver(gridPositions(20, 0.1));
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      expect(solver._pins.length).toBe(3);
    });

    it('pins are sorted by distance — closest first', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 100, maxVertices: 3 });
      // 3 vertices at x=0.3, 0.1, 0.2 — sorted: 0.1, 0.2, 0.3
      const positions = [0.3, 0, 0, 0.1, 0, 0, 0.2, 0, 0];
      const solver = makeSolver(positions);
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      // Pin order should be index 1 (dist 0.1), then 2 (0.2), then 0 (0.3)
      expect(solver._pins[0].index).toBe(1);
      expect(solver._pins[1].index).toBe(2);
      expect(solver._pins[2].index).toBe(0);
    });

    it('compliance increases with vertex distance', () => {
      const ctrl = new SoftBodyGrabController({
        grabRadius: 1.0,
        maxVertices: 2,
        baseCompliance: 0.001,
        complianceFalloff: 2.0,
      });
      // Two vertices: close (dist 0.1) and far (dist 0.8)
      const positions = [0.1, 0, 0, 0.8, 0, 0];
      const solver = makeSolver(positions);
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      const [closePin, farPin] = solver._pins;
      expect(closePin.compliance).toBeLessThan(farPin.compliance);
    });

    it('does nothing when no vertices are in range', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 0.01 });
      const positions = [1, 0, 0, 2, 0, 0]; // far from origin
      const solver = makeSolver(positions);
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      expect(solver._pins.length).toBe(0);
      expect(ctrl.isGrabbing('h1')).toBe(false);
    });

    it('double-grab from same hand releases previous grab first', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 2 });
      const solver = makeSolver(gridPositions(4, 0.1));

      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      const firstPinCount = solver._pins.length;

      // Grab again from same hand at a different position
      ctrl.grabStart('h1', { x: 0.2, y: 0, z: 0 }, solver as any);

      // First grab unpinned (unpins === firstPinCount), second grab added more pins
      expect(solver._unpins.length).toBe(firstPinCount);
    });

    it('two different hands can grab simultaneously', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 0.3, maxVertices: 4 });
      const solver = makeSolver(gridPositions(10, 0.05));
      const solver2 = makeSolver(gridPositions(10, 0.05));

      ctrl.grabStart('left', { x: 0, y: 0, z: 0 }, solver as any);
      ctrl.grabStart('right', { x: 0.4, y: 0, z: 0 }, solver2 as any);

      expect(ctrl.getActiveGrabs()).toHaveLength(2);
      expect(ctrl.isGrabbing('left')).toBe(true);
      expect(ctrl.isGrabbing('right')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // grabUpdate
  // -------------------------------------------------------------------------
  describe('grabUpdate', () => {
    it('calls updateAttachmentTarget for each grabbed vertex', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 3 });
      const solver = makeSolver(gridPositions(5, 0.1));
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      const pinCount = solver._pins.length;

      ctrl.grabUpdate('h1', { x: 0.5, y: 0, z: 0 });
      expect(solver._attachUpdates.length).toBe(pinCount);
    });

    it('moves targets by hand delta preserving local offsets', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 1 });
      // Single vertex at (0.1, 0, 0) — local offset is (0.1, 0, 0)
      const positions = [0.1, 0, 0];
      const solver = makeSolver(positions);
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);

      ctrl.grabUpdate('h1', { x: 0.5, y: 0, z: 0 });
      // Target should be handPos + localOffset = 0.5 + 0.1 = 0.6
      const target = solver._attachUpdates[0].target;
      expect(target.x).toBeCloseTo(0.6, 5);
    });

    it('no-ops when hand is not grabbing', () => {
      const ctrl = new SoftBodyGrabController();
      const solver = makeSolver([0, 0, 0]);
      // No grabStart called
      ctrl.grabUpdate('ghost', { x: 0, y: 0, z: 0 });
      expect(solver._attachUpdates.length).toBe(0);
    });

    it('multiple updates accumulate correctly', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 2 });
      const solver = makeSolver(gridPositions(4, 0.1));
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      const pinCount = solver._pins.length;

      ctrl.grabUpdate('h1', { x: 0.1, y: 0, z: 0 });
      ctrl.grabUpdate('h1', { x: 0.2, y: 0, z: 0 });
      ctrl.grabUpdate('h1', { x: 0.3, y: 0, z: 0 });

      expect(solver._attachUpdates.length).toBe(pinCount * 3);
    });
  });

  // -------------------------------------------------------------------------
  // grabEnd
  // -------------------------------------------------------------------------
  describe('grabEnd', () => {
    it('unpins all grabbed vertices', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 4 });
      const solver = makeSolver(gridPositions(6, 0.1));
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      const pinCount = solver._pins.length;

      ctrl.grabEnd('h1');
      expect(solver._unpins.length).toBe(pinCount);
    });

    it('removes hand from active grabs', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0 });
      const solver = makeSolver(gridPositions(3, 0.1));
      ctrl.grabStart('h1', { x: 0, y: 0, z: 0 }, solver as any);
      ctrl.grabEnd('h1');
      expect(ctrl.isGrabbing('h1')).toBe(false);
      expect(ctrl.getActiveGrabs()).not.toContain('h1');
    });

    it('no-ops when hand is not grabbing', () => {
      const ctrl = new SoftBodyGrabController();
      // Should not throw
      expect(() => ctrl.grabEnd('nonexistent')).not.toThrow();
    });

    it('only releases the specified hand', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 0.5, maxVertices: 2 });
      const s1 = makeSolver(gridPositions(4, 0.1));
      const s2 = makeSolver(gridPositions(4, 0.1));
      ctrl.grabStart('left', { x: 0, y: 0, z: 0 }, s1 as any);
      ctrl.grabStart('right', { x: 0.1, y: 0, z: 0 }, s2 as any); // within grabRadius

      ctrl.grabEnd('left');
      expect(ctrl.isGrabbing('left')).toBe(false);
      expect(ctrl.isGrabbing('right')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // releaseAll
  // -------------------------------------------------------------------------
  describe('releaseAll', () => {
    it('releases all active grabs', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 2 });
      const s1 = makeSolver(gridPositions(4, 0.1));
      const s2 = makeSolver(gridPositions(4, 0.1));
      ctrl.grabStart('left', { x: 0, y: 0, z: 0 }, s1 as any);
      ctrl.grabStart('right', { x: 0.05, y: 0, z: 0 }, s2 as any);

      ctrl.releaseAll();
      expect(ctrl.getActiveGrabs()).toHaveLength(0);
      expect(ctrl.isGrabbing('left')).toBe(false);
      expect(ctrl.isGrabbing('right')).toBe(false);
    });

    it('is safe to call when nothing is grabbed', () => {
      const ctrl = new SoftBodyGrabController();
      expect(() => ctrl.releaseAll()).not.toThrow();
    });

    it('unpins all vertices across all hands', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0, maxVertices: 2 });
      const s1 = makeSolver(gridPositions(4, 0.1));
      const s2 = makeSolver(gridPositions(4, 0.1));
      ctrl.grabStart('left', { x: 0, y: 0, z: 0 }, s1 as any);
      ctrl.grabStart('right', { x: 0.05, y: 0, z: 0 }, s2 as any);
      const totalPins = s1._pins.length + s2._pins.length;

      ctrl.releaseAll();
      expect(s1._unpins.length + s2._unpins.length).toBe(totalPins);
    });
  });

  // -------------------------------------------------------------------------
  // getActiveGrabs / isGrabbing
  // -------------------------------------------------------------------------
  describe('getActiveGrabs / isGrabbing', () => {
    it('returns empty array when nothing is grabbed', () => {
      expect(new SoftBodyGrabController().getActiveGrabs()).toEqual([]);
    });

    it('lists all current grab IDs', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0 });
      const s = makeSolver(gridPositions(3, 0.1));
      ctrl.grabStart('alpha', { x: 0, y: 0, z: 0 }, s as any);
      ctrl.grabStart('beta', { x: 0.05, y: 0, z: 0 }, s as any);
      const ids = ctrl.getActiveGrabs();
      expect(ids).toContain('alpha');
      expect(ids).toContain('beta');
    });

    it('isGrabbing returns false after grabEnd', () => {
      const ctrl = new SoftBodyGrabController({ grabRadius: 1.0 });
      const s = makeSolver(gridPositions(2, 0.1));
      ctrl.grabStart('h', { x: 0, y: 0, z: 0 }, s as any);
      expect(ctrl.isGrabbing('h')).toBe(true);
      ctrl.grabEnd('h');
      expect(ctrl.isGrabbing('h')).toBe(false);
    });
  });
});
