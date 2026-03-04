/**
 * Spatiotemporal Constraint Validator Tests
 *
 * Tests for compile-time verification of the three spatiotemporal constraint extensions:
 * - spatial_temporal_adjacent:  duration-constrained adjacency
 * - spatial_temporal_reachable: velocity-predicted reachability
 * - spatial_trajectory:         path-based trajectory constraints
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialConstraintValidator } from '../SpatialConstraintValidator';
import type {
  SpatialDeclaration,
  SpatialTemporalAdjacentConstraint,
  SpatialTemporalReachableConstraint,
  SpatialTrajectoryConstraint,
} from '../SpatialConstraintTypes';

describe('SpatialConstraintValidator - Spatiotemporal Extensions', () => {
  let validator: SpatialConstraintValidator;

  beforeEach(() => {
    validator = new SpatialConstraintValidator();
  });

  // ==========================================================================
  // spatial_temporal_adjacent
  // ==========================================================================

  describe('spatial_temporal_adjacent', () => {
    it('should pass when entities are within range (compile-time static check)', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'guard',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'guard',
              targetId: 'prisoner',
              maxDistance: 5.0,
              minDuration: 10,
            },
          ],
        },
        {
          entityId: 'prisoner',
          entityType: 'agent',
          position: { x: 2, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.stats.temporalAdjacentCount).toBe(1);
    });

    it('should fail when entities start out of range', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'guard',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'guard',
              targetId: 'prisoner',
              maxDistance: 3.0,
              minDuration: 5,
            },
          ],
        },
        {
          entityId: 'prisoner',
          entityType: 'agent',
          position: { x: 10, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'HSP036')).toBe(true);
      expect(result.diagnostics[0].message).toContain('duration constraint');
    });

    it('should error on negative minDuration', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 5,
              minDuration: -1,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'agent',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('minDuration must be >= 0');
    });

    it('should error on negative gracePeriod', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 5,
              minDuration: 3,
              gracePeriod: -2,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'agent',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('gracePeriod must be >= 0');
    });

    it('should warn when gracePeriod exceeds minDuration', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 5,
              minDuration: 2,
              gracePeriod: 10,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'agent',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true); // warnings don't invalidate
      expect(result.diagnostics.some((d) =>
        d.severity === 'warning' && d.message.includes('gracePeriod')
      )).toBe(true);
    });

    it('should emit info when positions are unknown at compile time', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 5,
              minDuration: 3,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'agent',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.some((d) =>
        d.severity === 'info' && d.message.includes('runtime')
      )).toBe(true);
    });

    it('should respect axis filter', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 2.0,
              minDuration: 5,
              axis: 'xz',
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'agent',
          position: { x: 1, y: 100, z: 0 }, // Far on Y but close on XZ
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true); // xz distance is only 1m
    });

    it('should error when target is missing', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_adjacent',
              sourceId: 'a',
              targetId: 'nonexistent',
              maxDistance: 5,
              minDuration: 3,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'HSP033')).toBe(true);
    });
  });

  // ==========================================================================
  // spatial_temporal_reachable
  // ==========================================================================

  describe('spatial_temporal_reachable', () => {
    it('should pass when distance is within maxPathLength', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'drone',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_reachable',
              sourceId: 'drone',
              targetId: 'pad',
              maxPathLength: 50,
              predictionHorizon: 5,
              movingObstacles: ['vehicle'],
            },
          ],
        },
        {
          entityId: 'pad',
          entityType: 'orb',
          position: { x: 20, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.stats.temporalReachableCount).toBe(1);
    });

    it('should fail when distance exceeds maxPathLength', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'drone',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_reachable',
              sourceId: 'drone',
              targetId: 'pad',
              maxPathLength: 5,
              predictionHorizon: 3,
            },
          ],
        },
        {
          entityId: 'pad',
          entityType: 'orb',
          position: { x: 20, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'HSP037')).toBe(true);
      expect(result.diagnostics.some((d) =>
        d.code === 'HSP037' && d.severity === 'error' && d.message.includes('exceeding')
      )).toBe(true);
    });

    it('should error on invalid predictionHorizon', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_reachable',
              sourceId: 'a',
              targetId: 'b',
              predictionHorizon: 0,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 5, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('predictionHorizon must be > 0');
    });

    it('should error on negative safetyMargin', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_reachable',
              sourceId: 'a',
              targetId: 'b',
              predictionHorizon: 3,
              safetyMargin: -1,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 5, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('safetyMargin must be >= 0');
    });

    it('should warn when no obstacles are specified', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_temporal_reachable',
              sourceId: 'a',
              targetId: 'b',
              predictionHorizon: 3,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 5, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.some((d) =>
        d.severity === 'warning' && d.message.includes('no moving or static obstacles')
      )).toBe(true);
    });

    it('should emit info when positions are unknown', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          constraints: [
            {
              kind: 'spatial_temporal_reachable',
              sourceId: 'a',
              targetId: 'b',
              predictionHorizon: 3,
              movingObstacles: ['vehicle'],
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 5, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.some((d) =>
        d.severity === 'info' && d.message.includes('runtime')
      )).toBe(true);
    });
  });

  // ==========================================================================
  // spatial_trajectory
  // ==========================================================================

  describe('spatial_trajectory', () => {
    // --- General validation ---

    it('should count trajectory constraints in stats', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'missile',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'missile',
              mode: 'keep_in',
              regionId: 'corridor',
              horizon: 5,
            },
          ],
        },
        {
          entityId: 'corridor',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -10, y: -10, z: -10 },
            max: { x: 10, y: 10, z: 10 },
          },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.stats.trajectoryCount).toBe(1);
    });

    it('should error on invalid horizon', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'keep_in',
              regionId: 'zone',
              horizon: -1,
            },
          ],
        },
        {
          entityId: 'zone',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('horizon must be > 0');
    });

    it('should error on invalid sampleCount', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'keep_in',
              regionId: 'zone',
              horizon: 5,
              sampleCount: 0,
            },
          ],
        },
        {
          entityId: 'zone',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: { min: { x: -5, y: -5, z: -5 }, max: { x: 5, y: 5, z: 5 } },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('sampleCount must be >= 1');
    });

    // --- keep_in / keep_out ---

    it('should error when keep_in mode lacks regionId', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'keep_in',
              horizon: 5,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('regionId is required');
    });

    it('should error when keep_out mode lacks regionId', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'keep_out',
              horizon: 5,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('regionId is required');
    });

    it('should warn when region entity has no bounds', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'keep_in',
              regionId: 'zone',
              horizon: 5,
            },
          ],
        },
        {
          entityId: 'zone',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          // No bounds
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.some((d) =>
        d.severity === 'warning' && d.message.includes('no declared bounds')
      )).toBe(true);
    });

    it('should pass when keep_in region exists with bounds', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'keep_in',
              regionId: 'zone',
              horizon: 5,
              sampleCount: 10,
            },
          ],
        },
        {
          entityId: 'zone',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: { min: { x: -10, y: -10, z: -10 }, max: { x: 10, y: 10, z: 10 } },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
    });

    // --- follow mode ---

    it('should error when follow mode lacks reference path', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'follow',
              horizon: 5,
              maxDeviation: 2.0,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('referencePath must contain at least 2 points');
    });

    it('should error when follow mode has only one reference point', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'follow',
              horizon: 5,
              referencePath: [{ x: 0, y: 0, z: 0 }],
              maxDeviation: 2.0,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
    });

    it('should error on non-positive maxDeviation', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'follow',
              horizon: 5,
              referencePath: [
                { x: 0, y: 0, z: 0 },
                { x: 10, y: 0, z: 0 },
              ],
              maxDeviation: 0,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('maxDeviation must be > 0');
    });

    it('should warn when entity starts far from reference path', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 50, y: 50, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'follow',
              horizon: 5,
              referencePath: [
                { x: 0, y: 0, z: 0 },
                { x: 10, y: 0, z: 0 },
              ],
              maxDeviation: 2.0,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true); // warning, not error
      expect(result.diagnostics.some((d) =>
        d.severity === 'warning' && d.message.includes('starts')
      )).toBe(true);
    });

    it('should pass when follow mode is properly configured', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'follow',
              horizon: 5,
              referencePath: [
                { x: 0, y: 0, z: 0 },
                { x: 10, y: 0, z: 0 },
                { x: 20, y: 5, z: 0 },
              ],
              maxDeviation: 3.0,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
    });

    // --- waypoint mode ---

    it('should error when waypoint mode has no waypoints', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'waypoint',
              horizon: 5,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('at least one waypoint');
    });

    it('should error on waypoint with non-positive radius', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'waypoint',
              horizon: 5,
              waypoints: [
                { position: { x: 5, y: 0, z: 0 }, radius: 0, label: 'wp1' },
              ],
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('invalid radius');
    });

    it('should pass when waypoints are properly configured', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'a',
              mode: 'waypoint',
              horizon: 10,
              sampleCount: 20,
              waypoints: [
                { position: { x: 5, y: 0, z: 0 }, radius: 1.0, label: 'checkpoint_1' },
                { position: { x: 10, y: 5, z: 0 }, radius: 2.0, label: 'checkpoint_2' },
                { position: { x: 15, y: 0, z: 0 }, radius: 1.5, label: 'finish' },
              ],
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // validateSingle (for spatiotemporal constraints)
  // ==========================================================================

  describe('validateSingle with spatiotemporal constraints', () => {
    it('should validate a single temporal_adjacent constraint', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [],
        },
        {
          entityId: 'b',
          entityType: 'agent',
          position: { x: 20, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const constraint: SpatialTemporalAdjacentConstraint = {
        kind: 'spatial_temporal_adjacent',
        sourceId: 'a',
        targetId: 'b',
        maxDistance: 5,
        minDuration: 3,
      };

      const diagnostics = validator.validateSingle(decls[0], constraint, decls);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].code).toBe('HSP036');
    });

    it('should validate a single trajectory constraint', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'missile',
          entityType: 'projectile',
          position: { x: 0, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const constraint: SpatialTrajectoryConstraint = {
        kind: 'spatial_trajectory',
        sourceId: 'missile',
        mode: 'follow',
        horizon: 5,
        // Missing referencePath
      };

      const diagnostics = validator.validateSingle(decls[0], constraint, decls);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].code).toBe('HSP038');
    });
  });

  // ==========================================================================
  // Mixed constraints (original + spatiotemporal)
  // ==========================================================================

  describe('mixed constraints', () => {
    it('should correctly count all constraint types in stats', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            { kind: 'spatial_adjacent', sourceId: 'a', targetId: 'b', maxDistance: 10 },
            { kind: 'spatial_temporal_adjacent', sourceId: 'a', targetId: 'b', maxDistance: 10, minDuration: 5 },
          ],
        },
        {
          entityId: 'b',
          entityType: 'agent',
          position: { x: 1, y: 0, z: 0 },
          constraints: [
            { kind: 'spatial_reachable', sourceId: 'b', targetId: 'c' },
            { kind: 'spatial_temporal_reachable', sourceId: 'b', targetId: 'c', predictionHorizon: 3, movingObstacles: ['car'] },
          ],
        },
        {
          entityId: 'c',
          entityType: 'orb',
          position: { x: 5, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_trajectory',
              sourceId: 'c',
              mode: 'waypoint',
              horizon: 5,
              waypoints: [{ position: { x: 10, y: 0, z: 0 }, radius: 1 }],
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.stats.totalConstraints).toBe(5);
      expect(result.stats.adjacentCount).toBe(1);
      expect(result.stats.reachableCount).toBe(1);
      expect(result.stats.temporalAdjacentCount).toBe(1);
      expect(result.stats.temporalReachableCount).toBe(1);
      expect(result.stats.trajectoryCount).toBe(1);
    });
  });
});
