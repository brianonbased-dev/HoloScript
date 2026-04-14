/**
 * SpatialDataGenerator Research Implementation Tests
 *
 * Tests for zone-aware spatial relationship types (P.PROCGEN.01).
 */

import { describe, it, expect } from 'vitest';
import type { SpatialRelationshipType, ZoneMetadata } from '../SpatialDataGenerator';

// =============================================================================
// SpatialRelationshipType — zone-aware types (P.PROCGEN.01)
// =============================================================================

describe('SpatialRelationshipType (zone-aware)', () => {
  it('accepts zone_adjacent as a valid type', () => {
    const type: SpatialRelationshipType = 'zone_adjacent';
    expect(type).toBe('zone_adjacent');
  });

  it('accepts zone_contains as a valid type', () => {
    const type: SpatialRelationshipType = 'zone_contains';
    expect(type).toBe('zone_contains');
  });

  it('accepts biome_transition as a valid type', () => {
    const type: SpatialRelationshipType = 'biome_transition';
    expect(type).toBe('biome_transition');
  });

  it('still accepts original object-level types', () => {
    const types: SpatialRelationshipType[] = ['adjacent', 'contains', 'reachable'];
    expect(types).toHaveLength(3);
  });
});

// =============================================================================
// ZoneMetadata (P.PROCGEN.01)
// =============================================================================

describe('ZoneMetadata', () => {
  it('accepts a complete zone metadata object', () => {
    const zone: ZoneMetadata = {
      zoneId: 'zone_forest_01',
      biome: 'forest',
      bounds: {
        min: [0, 0, 0 ],
        max: [100, 50, 100 ],
      },
      objectIds: ['tree_01', 'tree_02', 'rock_01'],
      adjacentZones: ['zone_desert_01', 'zone_river_01'],
    };
    expect(zone.zoneId).toBe('zone_forest_01');
    expect(zone.biome).toBe('forest');
    expect(zone.objectIds).toHaveLength(3);
    expect(zone.adjacentZones).toHaveLength(2);
  });

  it('accepts optional level field', () => {
    const zone: ZoneMetadata = {
      zoneId: 'zone_basement',
      biome: 'urban',
      bounds: { min: [0, -10, 0 ], max: [50, 0, 50 ] },
      objectIds: [],
      adjacentZones: [],
      level: -1,
    };
    expect(zone.level).toBe(-1);
  });
});
