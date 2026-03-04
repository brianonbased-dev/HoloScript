/**
 * SpatialConstraintValidator Tests
 *
 * Comprehensive tests for compile-time verification of spatial constraints:
 * - spatial_adjacent:  proximity constraint validation
 * - spatial_contains:  containment constraint validation
 * - spatial_reachable: reachability constraint validation
 * - Cross-constraint consistency
 * - Edge cases and error reporting
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialConstraintValidator } from '../SpatialConstraintValidator';
import type {
  SpatialDeclaration,
  SpatialAdjacentConstraint,
  SpatialContainsConstraint,
  SpatialReachableConstraint,
  SpatialConstraintCheckResult,
} from '../SpatialConstraintTypes';

describe('SpatialConstraintValidator', () => {
  let validator: SpatialConstraintValidator;

  beforeEach(() => {
    validator = new SpatialConstraintValidator();
  });

  // ==========================================================================
  // Empty / trivial inputs
  // ==========================================================================

  describe('basic validation', () => {
    it('should return valid for empty declarations', () => {
      const result = validator.validate([]);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
      expect(result.stats.totalConstraints).toBe(0);
    });

    it('should return valid for declarations with no constraints', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'box1',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [],
        },
      ];
      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.diagnostics).toHaveLength(0);
    });

    it('should populate stats correctly', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            { kind: 'spatial_adjacent', sourceId: 'a', targetId: 'b', maxDistance: 5 },
            { kind: 'spatial_adjacent', sourceId: 'a', targetId: 'c', maxDistance: 3 },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 1, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'b',
              containedId: 'd',
            },
          ],
        },
        {
          entityId: 'c',
          entityType: 'orb',
          position: { x: 2, y: 0, z: 0 },
          constraints: [],
        },
        {
          entityId: 'd',
          entityType: 'orb',
          position: { x: 1, y: 0, z: 0 },
          constraints: [
            { kind: 'spatial_reachable', sourceId: 'd', targetId: 'a', maxPathLength: 10 },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.stats.totalConstraints).toBe(4);
      expect(result.stats.adjacentCount).toBe(2);
      expect(result.stats.containsCount).toBe(1);
      expect(result.stats.reachableCount).toBe(1);
    });
  });

  // ==========================================================================
  // spatial_adjacent
  // ==========================================================================

  describe('spatial_adjacent', () => {
    it('should pass when entities are within maxDistance', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'shelf',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'shelf',
              targetId: 'book',
              maxDistance: 2.0,
            },
          ],
        },
        {
          entityId: 'book',
          entityType: 'orb',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.filter((d) => d.severity === 'error')).toHaveLength(0);
    });

    it('should fail when entities exceed maxDistance', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'shelf',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'shelf',
              targetId: 'book',
              maxDistance: 2.0,
            },
          ],
        },
        {
          entityId: 'book',
          entityType: 'orb',
          position: { x: 10, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0].code).toBe('HSP030');
      expect(result.diagnostics[0].constraintKind).toBe('spatial_adjacent');
      expect(result.diagnostics[0].message).toContain('10.00m');
      expect(result.diagnostics[0].message).toContain('2m');
    });

    it('should fail when entities are closer than minDistance', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 10,
              minDistance: 2.0,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 0.5, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes('at least'))).toBe(true);
    });

    it('should respect axis filter (xz plane only)', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 2.0,
              axis: 'xz',
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 1, y: 100, z: 0 }, // Far on Y but close on XZ
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      // Should pass because XZ distance is 1m (within 2m), Y is ignored
      expect(result.valid).toBe(true);
    });

    it('should fail with xz filter when xz distance exceeds maxDistance', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 2.0,
              axis: 'xz',
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 3, y: 0, z: 3 }, // XZ distance = ~4.24
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('xz axis');
    });

    it('should emit info when positions are not known at compile time', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          // No position
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 5,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true); // info, not error
      expect(result.diagnostics.some((d) => d.severity === 'info')).toBe(true);
      expect(result.diagnostics[0].message).toContain('deferring to runtime');
    });

    it('should include label in error messages when provided', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 1,
              label: 'shelf proximity check',
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 10, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.diagnostics[0].message).toContain('shelf proximity check');
    });

    it('should provide suggestions for max distance violation', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 1,
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
      expect(result.diagnostics[0].suggestions).toBeDefined();
      expect(result.diagnostics[0].suggestions!.length).toBeGreaterThan(0);
      expect(result.diagnostics[0].suggestions![0]).toContain('Move');
    });
  });

  // ==========================================================================
  // spatial_contains
  // ==========================================================================

  describe('spatial_contains', () => {
    it('should pass when entity is inside container (box bounds)', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'room',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'room',
              containedId: 'chair',
            },
          ],
        },
        {
          entityId: 'chair',
          entityType: 'orb',
          position: { x: 1, y: 0, z: 1 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
    });

    it('should fail when entity is outside container bounds', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'room',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'room',
              containedId: 'chair',
            },
          ],
        },
        {
          entityId: 'chair',
          entityType: 'orb',
          position: { x: 10, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].code).toBe('HSP031');
      expect(result.diagnostics[0].constraintKind).toBe('spatial_contains');
    });

    it('should pass when entity is inside sphere container', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'bubble',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            center: { x: 0, y: 0, z: 0 },
            radius: 10,
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'bubble',
              containedId: 'particle',
            },
          ],
        },
        {
          entityId: 'particle',
          entityType: 'orb',
          position: { x: 3, y: 3, z: 3 }, // dist ~5.2, inside radius 10
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
    });

    it('should fail when entity is outside sphere container', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'bubble',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            center: { x: 0, y: 0, z: 0 },
            radius: 3,
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'bubble',
              containedId: 'particle',
            },
          ],
        },
        {
          entityId: 'particle',
          entityType: 'orb',
          position: { x: 3, y: 3, z: 3 }, // dist ~5.2, outside radius 3
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
    });

    it('should respect margin parameter', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'room',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'room',
              containedId: 'chair',
              margin: 2.0,
            },
          ],
        },
        {
          entityId: 'chair',
          entityType: 'orb',
          position: { x: 4, y: 0, z: 0 }, // Inside bounds but outside with 2m margin
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('margin');
    });

    it('should warn when container has no bounds', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'room',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          // No bounds
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'room',
              containedId: 'chair',
            },
          ],
        },
        {
          entityId: 'chair',
          entityType: 'orb',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true); // warnings don't invalidate
      expect(result.diagnostics.some((d) => d.severity === 'warning')).toBe(true);
      expect(result.diagnostics[0].message).toContain('no declared bounds');
    });

    it('should validate strict containment with full bounds check', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'room',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'room',
              containedId: 'table',
              strict: true,
            },
          ],
        },
        {
          entityId: 'table',
          entityType: 'orb',
          position: { x: 4, y: 0, z: 0 },
          bounds: {
            min: { x: -2, y: -1, z: -1 },
            max: { x: 2, y: 1, z: 1 },
          },
          constraints: [],
        },
      ];

      // Table center at x=4, bounds extend from x=2 to x=6
      // Container max.x = 5, so table extends beyond container
      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].message).toContain('strict');
    });
  });

  // ==========================================================================
  // spatial_reachable
  // ==========================================================================

  describe('spatial_reachable', () => {
    it('should pass when straight-line distance is within maxPathLength', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'npc',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_reachable',
              sourceId: 'npc',
              targetId: 'exit',
              maxPathLength: 20,
            },
          ],
        },
        {
          entityId: 'exit',
          entityType: 'orb',
          position: { x: 10, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
    });

    it('should fail when straight-line distance exceeds maxPathLength', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'npc',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_reachable',
              sourceId: 'npc',
              targetId: 'exit',
              maxPathLength: 5,
            },
          ],
        },
        {
          entityId: 'exit',
          entityType: 'orb',
          position: { x: 10, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].code).toBe('HSP032');
      expect(result.diagnostics[0].message).toContain('exceeding');
    });

    it('should detect line-of-sight blocking by obstacle', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'npc',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_reachable',
              sourceId: 'npc',
              targetId: 'exit',
              obstacleTypes: ['wall'],
              algorithm: 'line_of_sight',
            },
          ],
        },
        {
          entityId: 'exit',
          entityType: 'orb',
          position: { x: 20, y: 0, z: 0 },
          constraints: [],
        },
        {
          entityId: 'wall1',
          entityType: 'wall',
          position: { x: 10, y: 0, z: 0 },
          bounds: {
            min: { x: 9, y: -5, z: -5 },
            max: { x: 11, y: 5, z: 5 },
          },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.message.includes('blocked'))).toBe(true);
    });

    it('should warn (not error) for navmesh algorithm when LOS is blocked', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'npc',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_reachable',
              sourceId: 'npc',
              targetId: 'exit',
              obstacleTypes: ['wall'],
              algorithm: 'navmesh', // navmesh can path around obstacles
            },
          ],
        },
        {
          entityId: 'exit',
          entityType: 'orb',
          position: { x: 20, y: 0, z: 0 },
          constraints: [],
        },
        {
          entityId: 'wall1',
          entityType: 'wall',
          position: { x: 10, y: 0, z: 0 },
          bounds: {
            min: { x: 9, y: -5, z: -5 },
            max: { x: 11, y: 5, z: 5 },
          },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      // navmesh means the obstacle might be navigable around, so warning not error
      expect(result.valid).toBe(true);
      expect(result.diagnostics.some((d) => d.severity === 'warning')).toBe(true);
    });

    it('should emit info when positions are unknown', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'npc',
          entityType: 'agent',
          // No position
          constraints: [
            {
              kind: 'spatial_reachable',
              sourceId: 'npc',
              targetId: 'exit',
              maxPathLength: 10,
            },
          ],
        },
        {
          entityId: 'exit',
          entityType: 'orb',
          position: { x: 5, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
      expect(result.diagnostics.some((d) => d.severity === 'info')).toBe(true);
    });
  });

  // ==========================================================================
  // Reference resolution
  // ==========================================================================

  describe('reference resolution', () => {
    it('should error when target entity does not exist', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'nonexistent',
              maxDistance: 5,
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics[0].code).toBe('HSP033');
      expect(result.diagnostics[0].message).toContain('nonexistent');
    });

    it('should resolve target by entity type', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'shelf',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'shelf',
              targetId: 'furniture', // Match by type, not ID
              maxDistance: 5,
            },
          ],
        },
        {
          entityId: 'table_01',
          entityType: 'furniture',
          position: { x: 2, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(true);
    });
  });

  // ==========================================================================
  // Circular reference detection
  // ==========================================================================

  describe('circular reference detection', () => {
    it('should detect direct circular containment', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -10, y: -10, z: -10 },
            max: { x: 10, y: 10, z: 10 },
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'a',
              containedId: 'b',
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -10, y: -10, z: -10 },
            max: { x: 10, y: 10, z: 10 },
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'b',
              containedId: 'a',
            },
          ],
        },
      ];

      const result = validator.validate(decls);
      expect(result.valid).toBe(false);
      expect(result.diagnostics.some((d) => d.code === 'HSP034')).toBe(true);
      expect(result.diagnostics.some((d) => d.message.includes('Circular'))).toBe(true);
    });
  });

  // ==========================================================================
  // Cross-constraint consistency
  // ==========================================================================

  describe('cross-constraint consistency', () => {
    it('should warn when adjacent target is unreachable from container', () => {
      const decls: SpatialDeclaration[] = [
        // Container
        {
          entityId: 'room',
          entityType: 'zone',
          position: { x: 0, y: 0, z: 0 },
          bounds: {
            min: { x: -5, y: -5, z: -5 },
            max: { x: 5, y: 5, z: 5 },
          },
          constraints: [
            {
              kind: 'spatial_contains',
              containerId: 'room',
              containedId: 'npc',
            },
          ],
        },
        // NPC inside room, must be adjacent to distant target
        {
          entityId: 'npc',
          entityType: 'agent',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'npc',
              targetId: 'faraway',
              maxDistance: 2.0,
            },
          ],
        },
        // Target very far from room
        {
          entityId: 'faraway',
          entityType: 'orb',
          position: { x: 100, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      // The adjacent constraint itself will fail (distance > 2m)
      // The cross-constraint check should also warn about inconsistency
      expect(result.diagnostics.some((d) => d.code === 'HSP035')).toBe(true);
    });
  });

  // ==========================================================================
  // validateSingle
  // ==========================================================================

  describe('validateSingle', () => {
    it('should validate a single constraint in isolation', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 20, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const constraint: SpatialAdjacentConstraint = {
        kind: 'spatial_adjacent',
        sourceId: 'a',
        targetId: 'b',
        maxDistance: 5,
      };

      const diagnostics = validator.validateSingle(decls[0], constraint, decls);
      expect(diagnostics.length).toBeGreaterThan(0);
      expect(diagnostics[0].code).toBe('HSP030');
    });
  });

  // ==========================================================================
  // computeAxisDistance
  // ==========================================================================

  describe('computeAxisDistance', () => {
    it('should compute xyz distance correctly', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 0 };
      expect(validator.computeAxisDistance(a, b, 'xyz')).toBeCloseTo(5);
    });

    it('should compute xz distance (ignoring y)', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 100, z: 4 };
      expect(validator.computeAxisDistance(a, b, 'xz')).toBeCloseTo(5);
    });

    it('should compute single axis distance', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 5, y: 10, z: 15 };
      expect(validator.computeAxisDistance(a, b, 'x')).toBeCloseTo(5);
      expect(validator.computeAxisDistance(a, b, 'y')).toBeCloseTo(10);
      expect(validator.computeAxisDistance(a, b, 'z')).toBeCloseTo(15);
    });

    it('should compute xy distance (ignoring z)', () => {
      const a = { x: 0, y: 0, z: 0 };
      const b = { x: 3, y: 4, z: 100 };
      expect(validator.computeAxisDistance(a, b, 'xy')).toBeCloseTo(5);
    });
  });

  // ==========================================================================
  // Constraint map
  // ==========================================================================

  describe('constraintMap', () => {
    it('should populate constraintMap correctly', () => {
      const decls: SpatialDeclaration[] = [
        {
          entityId: 'a',
          entityType: 'orb',
          position: { x: 0, y: 0, z: 0 },
          constraints: [
            {
              kind: 'spatial_adjacent',
              sourceId: 'a',
              targetId: 'b',
              maxDistance: 10,
            },
          ],
        },
        {
          entityId: 'b',
          entityType: 'orb',
          position: { x: 1, y: 0, z: 0 },
          constraints: [],
        },
      ];

      const result = validator.validate(decls);
      expect(result.constraintMap.has('a')).toBe(true);
      expect(result.constraintMap.get('a')!.length).toBe(1);
      expect(result.constraintMap.get('a')![0].kind).toBe('spatial_adjacent');
    });
  });
});
