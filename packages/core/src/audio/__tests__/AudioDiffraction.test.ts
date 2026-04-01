import { describe, it, expect, beforeEach } from 'vitest';
import {
  AudioDiffractionSystem,
  DiffractionEdge,
  EdgeDetectionProvider,
  LineOfSightProvider,
} from '../AudioDiffraction';

describe('AudioDiffraction', () => {
  let system: AudioDiffractionSystem;

  beforeEach(() => {
    system = new AudioDiffractionSystem();
  });

  // ==========================================================================
  // CONFIGURATION
  // ==========================================================================

  describe('Configuration', () => {
    it('has default configuration', () => {
      const config = system.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.maxPaths).toBe(2);
      expect(config.minDiffractionGain).toBe(0.01);
      expect(config.frequency).toBe(1000);
      expect(config.speedOfSound).toBe(343);
    });

    it('updates configuration partially', () => {
      system.setConfig({ maxPaths: 3, frequency: 500 });
      const config = system.getConfig();
      expect(config.maxPaths).toBe(3);
      expect(config.frequency).toBe(500);
      expect(config.enabled).toBe(true); // Unchanged
    });

    it('disables diffraction', () => {
      system.setConfig({ enabled: false });
      expect(system.getConfig().enabled).toBe(false);
    });

    it('sets edge detection provider', () => {
      const provider: EdgeDetectionProvider = () => [];
      system.setEdgeDetectionProvider(provider);
      // No exception thrown
    });

    it('sets line of sight provider', () => {
      const provider: LineOfSightProvider = () => true;
      system.setLineOfSightProvider(provider);
      // No exception thrown
    });
  });

  // ==========================================================================
  // DIFFRACTION COMPUTATION - DIRECT PATH
  // ==========================================================================

  describe('Direct Path (No Diffraction)', () => {
    it('returns no diffraction when direct path is clear', () => {
      // Setup providers
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider(() => true); // Always clear

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.hasDiffraction).toBe(false);
      expect(result.paths.length).toBe(0);
      expect(result.combinedCoefficient).toBe(0);
      expect(result.volumeMultiplier).toBe(1);
    });

    it('returns no diffraction when disabled', () => {
      system.setConfig({ enabled: false });

      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider(() => false); // Obstructed

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.hasDiffraction).toBe(false);
      expect(result.paths.length).toBe(0);
    });

    it('returns no diffraction when no providers set', () => {
      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.hasDiffraction).toBe(false);
      expect(result.paths.length).toBe(0);
    });
  });

  // ==========================================================================
  // DIFFRACTION COMPUTATION - OBSTRUCTED PATH
  // ==========================================================================

  describe('Obstructed Path (Diffraction Active)', () => {
    it('computes single diffraction path when direct path is blocked', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);

      // Direct path blocked, but edge paths clear
      const losProvider: LineOfSightProvider = (p1, p2) => {
        // Block direct path from source to listener
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true; // Edge paths are clear
      };

      system.setLineOfSightProvider(losProvider);

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.hasDiffraction).toBe(true);
      expect(result.paths.length).toBeGreaterThan(0);
      expect(result.combinedCoefficient).toBeGreaterThan(0);
      expect(result.volumeMultiplier).toBeGreaterThan(0);
      expect(result.volumeMultiplier).toBeLessThanOrEqual(1);
    });

    it('diffraction path has correct structure', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.paths.length).toBe(1);
      const path = result.paths[0];

      expect(path.edgeId).toBe('edge1');
      expect(path.diffractionPoint).toBeDefined();
      expect(path.totalDistance).toBeGreaterThan(0);
      expect(path.directDistance).toBeGreaterThan(0);
      expect(path.pathDifference).toBeGreaterThanOrEqual(0);
      expect(path.diffractionCoefficient).toBeGreaterThanOrEqual(0);
      expect(path.diffractionCoefficient).toBeLessThanOrEqual(1);
      expect(path.angle).toBeGreaterThanOrEqual(0);
      expect(path.angle).toBeLessThanOrEqual(Math.PI);
    });

    it('total distance is greater than or equal to direct distance', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      const path = result.paths[0];
      // In some geometric configurations (e.g., edge at exact midpoint),
      // total distance can equal direct distance
      expect(path.totalDistance).toBeGreaterThanOrEqual(path.directDistance);
    });
  });

  // ==========================================================================
  // MULTIPLE DIFFRACTION PATHS
  // ==========================================================================

  describe('Multiple Diffraction Paths', () => {
    it('computes multiple diffraction paths', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
        {
          id: 'edge2',
          point1: { x: 5, y: -5, z: 0 },
          point2: { x: 5, y: 0, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false; // Direct path blocked
        }
        return true; // Edge paths clear
      });

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.paths.length).toBe(2);
      expect(result.paths[0].edgeId).toBeDefined();
      expect(result.paths[1].edgeId).toBeDefined();
      expect(result.paths[0].edgeId).not.toBe(result.paths[1].edgeId);
    });

    it('limits paths to maxPaths', () => {
      system.setConfig({ maxPaths: 1 });

      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
        {
          id: 'edge2',
          point1: { x: 5, y: -5, z: 0 },
          point2: { x: 5, y: 0, z: 0 },
        },
        {
          id: 'edge3',
          point1: { x: 5, y: 10, z: 0 },
          point2: { x: 5, y: 20, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.paths.length).toBe(1); // Limited to maxPaths
    });

    it('sorts paths by diffraction coefficient (strongest first)', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
        {
          id: 'edge2',
          point1: { x: 5, y: -5, z: 0 },
          point2: { x: 5, y: 0, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      if (result.paths.length >= 2) {
        expect(result.paths[0].diffractionCoefficient).toBeGreaterThanOrEqual(
          result.paths[1].diffractionCoefficient
        );
      }
    });

    it('filters paths below minDiffractionGain', () => {
      system.setConfig({ minDiffractionGain: 0.5 }); // High threshold

      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      // Paths with low coefficients should be filtered out
      for (const path of result.paths) {
        expect(path.diffractionCoefficient).toBeGreaterThanOrEqual(0.5);
      }
    });
  });

  // ==========================================================================
  // OBSTRUCTED EDGE PATHS
  // ==========================================================================

  describe('Obstructed Edge Paths', () => {
    it('ignores edges where source->edge path is blocked', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);

      // Block everything
      system.setLineOfSightProvider(() => false);

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.hasDiffraction).toBe(false);
      expect(result.paths.length).toBe(0);
    });

    it('ignores edges where edge->listener path is blocked', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);

      // Block direct and edge->listener, but allow source->edge
      const losProvider: LineOfSightProvider = (p1, p2) => {
        // Block direct path
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        // Block edge->listener (p1.x = 5, p2.x = 10)
        if (p1.x === 5 && p2.x === 10) {
          return false;
        }
        return true;
      };

      system.setLineOfSightProvider(losProvider);

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.hasDiffraction).toBe(false);
      expect(result.paths.length).toBe(0);
    });
  });

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  describe('Cache Management', () => {
    it('caches diffraction results', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider(() => true);

      system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      const cached = system.getCachedResult('src1');
      expect(cached).toBeDefined();
      expect(cached!.sourceId).toBe('src1');
    });

    it('getCachedResult returns undefined for unknown source', () => {
      const cached = system.getCachedResult('unknown');
      expect(cached).toBeUndefined();
    });

    it('clearCache removes all cached results', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider(() => true);

      system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');
      system.clearCache();

      expect(system.getCachedResult('src1')).toBeUndefined();
    });
  });

  // ==========================================================================
  // INTEGRATION HELPERS
  // ==========================================================================

  describe('Integration Helpers', () => {
    it('getVolumeMultiplier returns 1.0 for direct path', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider(() => true);

      system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(system.getVolumeMultiplier('src1')).toBe(1.0);
    });

    it('getVolumeMultiplier returns diffraction coefficient when obstructed', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      const multiplier = system.getVolumeMultiplier('src1');
      expect(multiplier).toBeGreaterThan(0);
      expect(multiplier).toBeLessThan(1);
    });

    it('getVolumeMultiplier returns 1.0 for unknown source', () => {
      expect(system.getVolumeMultiplier('unknown')).toBe(1.0);
    });

    it('hasDiffraction returns true when diffraction is active', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(system.hasDiffraction('src1')).toBe(true);
    });

    it('hasDiffraction returns false when direct path exists', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider(() => true);

      system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(system.hasDiffraction('src1')).toBe(false);
    });

    it('hasDiffraction returns false for unknown source', () => {
      expect(system.hasDiffraction('unknown')).toBe(false);
    });

    it('getDiffractionPaths returns paths for source', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      const paths = system.getDiffractionPaths('src1');
      expect(paths.length).toBeGreaterThan(0);
    });

    it('getDiffractionPaths returns empty array for unknown source', () => {
      expect(system.getDiffractionPaths('unknown')).toEqual([]);
    });
  });

  // ==========================================================================
  // EDGE CASES
  // ==========================================================================

  describe('Edge Cases', () => {
    it('handles zero-length edge (point1 = point2)', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 5, z: 0 },
          point2: { x: 5, y: 5, z: 0 }, // Same point
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      // Should handle gracefully (may or may not produce diffraction)
      expect(result).toBeDefined();
    });

    it('handles source = listener position', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider(() => true);

      const result = system.computeDiffraction(
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 0 }, // Same position
        'src1'
      );

      expect(result).toBeDefined();
    });

    it('handles no edges available', () => {
      system.setEdgeDetectionProvider(() => []); // No edges
      system.setLineOfSightProvider(() => false);

      const result = system.computeDiffraction({ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, 'src1');

      expect(result.hasDiffraction).toBe(false);
      expect(result.paths.length).toBe(0);
    });
  });

  // ==========================================================================
  // FREQUENCY-DEPENDENT DIFFRACTION
  // ==========================================================================

  describe('Frequency-Dependent Behavior', () => {
    it('higher frequency results in stronger attenuation', () => {
      const edges: DiffractionEdge[] = [
        {
          id: 'edge1',
          point1: { x: 5, y: 0, z: 0 },
          point2: { x: 5, y: 10, z: 0 },
        },
      ];

      system.setEdgeDetectionProvider(() => edges);
      system.setLineOfSightProvider((p1, p2) => {
        if ((p1.x === 0 && p2.x === 10) || (p1.x === 10 && p2.x === 0)) {
          return false;
        }
        return true;
      });

      // Low frequency (100 Hz)
      system.setConfig({ frequency: 100 });
      const result1 = system.computeDiffraction(
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        'src1'
      );

      // High frequency (10000 Hz)
      system.setConfig({ frequency: 10000 });
      const result2 = system.computeDiffraction(
        { x: 0, y: 0, z: 0 },
        { x: 10, y: 0, z: 0 },
        'src2'
      );

      // Higher frequency should have lower coefficient (more attenuation)
      if (result1.paths.length > 0 && result2.paths.length > 0) {
        expect(result2.paths[0].diffractionCoefficient).toBeLessThanOrEqual(
          result1.paths[0].diffractionCoefficient
        );
      }
    });
  });
});
