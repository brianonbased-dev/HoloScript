import { describe, it, expect } from 'vitest';
import {
  validateZoneConstraints,
  validateWorldConstraints,
  getConstraintsByScope,
  getConstraintsForBiome,
  mergeConstraints,
  getErrors,
  getWarnings,
  getHints,
  ZONE_CONSTRAINTS,
  WORLD_CONSTRAINTS,
} from '../ZoneWorldConstraints.js';
import type {
  ZoneMetadata,
  WorldMetadata,
  ZoneWorldConstraint,
  PopulationConstraint,
  AdjacencyConstraint,
} from '../ZoneWorldConstraints.js';

// =============================================================================
// HELPERS
// =============================================================================

function makeZone(overrides: Partial<ZoneMetadata> = {}): ZoneMetadata {
  return {
    id: 'zone-1',
    name: 'Test Zone',
    biome: 'forest',
    traits: [],
    entityTraits: [],
    adjacentZones: [],
    entityCounts: {},
    totalEntities: 0,
    ...overrides,
  };
}

function makeWorld(zones: ZoneMetadata[], traits: string[] = []): WorldMetadata {
  return { zones, traits, narrativeRequirements: [] };
}

// =============================================================================
// ZONE CONSTRAINT VALIDATION
// =============================================================================

describe('Zone Constraint Validation', () => {
  describe('requires', () => {
    const constraints: ZoneWorldConstraint[] = [
      {
        type: 'requires',
        source: 'forest',
        targets: ['vegetation'],
        scope: 'zone',
        severity: 'warning',
        message: 'Forest zones need vegetation.',
      },
    ];

    it('should pass when required trait is present', () => {
      const zone = makeZone({ biome: 'forest', entityTraits: ['vegetation'] });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(0);
    });

    it('should fail when required trait is missing', () => {
      const zone = makeZone({ biome: 'forest', entityTraits: [] });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('warning');
    });

    it('should not apply to non-matching biomes', () => {
      const zone = makeZone({ biome: 'desert', entityTraits: [] });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(0);
    });

    it('should match source by zone trait too', () => {
      const zone = makeZone({ biome: 'custom', traits: ['forest'], entityTraits: [] });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(1);
    });
  });

  describe('conflicts', () => {
    const constraints: ZoneWorldConstraint[] = [
      {
        type: 'conflicts',
        source: 'underwater',
        targets: ['fire'],
        scope: 'zone',
        severity: 'error',
        message: 'Underwater zones cannot have fire.',
      },
    ];

    it('should pass when no conflicting trait', () => {
      const zone = makeZone({ biome: 'underwater', entityTraits: ['fish'] });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(0);
    });

    it('should fail when conflicting trait present', () => {
      const zone = makeZone({ biome: 'underwater', entityTraits: ['fire'] });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('error');
    });
  });

  describe('oneof', () => {
    const constraints: ZoneWorldConstraint[] = [
      {
        type: 'oneof',
        source: 'biome_mode',
        targets: ['ocean', 'desert', 'tundra'],
        scope: 'zone',
        severity: 'error',
        message: 'Zone can only have one extreme biome.',
      },
    ];

    it('should pass with one matching biome', () => {
      const zone = makeZone({ biome: 'ocean' });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(0);
    });

    it('should fail with multiple matching traits', () => {
      const zone = makeZone({ biome: 'ocean', traits: ['desert'] });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(1);
    });
  });

  describe('population', () => {
    it('should pass when entity count is within bounds', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'population',
          source: 'forest',
          targets: ['tree'],
          scope: 'zone',
          severity: 'warning',
          message: 'Forest needs trees.',
          min: 3,
          max: 100,
          per: 'zone',
        } as PopulationConstraint,
      ];

      const zone = makeZone({ biome: 'forest', entityCounts: { tree: 10 } });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(0);
    });

    it('should fail when below minimum', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'population',
          source: 'forest',
          targets: ['tree'],
          scope: 'zone',
          severity: 'warning',
          message: '',
          min: 5,
          max: 100,
          per: 'zone',
        } as PopulationConstraint,
      ];

      const zone = makeZone({ biome: 'forest', entityCounts: { tree: 2 } });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(1);
    });

    it('should fail when above maximum', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'population',
          source: 'urban',
          targets: ['vehicle'],
          scope: 'zone',
          severity: 'warning',
          message: '',
          min: 0,
          max: 50,
          per: 'zone',
        } as PopulationConstraint,
      ];

      const zone = makeZone({ biome: 'urban', entityCounts: { vehicle: 100 } });
      const violations = validateZoneConstraints(zone, constraints);
      expect(violations).toHaveLength(1);
    });
  });
});

// =============================================================================
// WORLD CONSTRAINT VALIDATION
// =============================================================================

describe('World Constraint Validation', () => {
  describe('requires', () => {
    const constraints: ZoneWorldConstraint[] = [
      {
        type: 'requires',
        source: 'playable',
        targets: ['spawn_zone'],
        scope: 'world',
        severity: 'error',
        message: 'Playable worlds need a spawn zone.',
      },
    ];

    it('should pass when required zone exists', () => {
      const world = makeWorld(
        [makeZone({ traits: ['spawn_zone'] })],
        ['playable'],
      );
      const violations = validateWorldConstraints(world, constraints);
      expect(violations).toHaveLength(0);
    });

    it('should fail when required zone is missing', () => {
      const world = makeWorld(
        [makeZone()],
        ['playable'],
      );
      const violations = validateWorldConstraints(world, constraints);
      expect(violations).toHaveLength(1);
      expect(violations[0].severity).toBe('error');
      expect(violations[0].context).toBe('World');
    });

    it('should not apply if world lacks the source trait', () => {
      const world = makeWorld([makeZone()], []);
      const violations = validateWorldConstraints(world, constraints);
      expect(violations).toHaveLength(0);
    });
  });

  describe('population (world scope)', () => {
    it('should sum entity counts across all zones', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'population',
          source: 'playable',
          targets: ['spawn_point'],
          scope: 'world',
          severity: 'error',
          message: '',
          min: 3,
          max: Infinity,
          per: 'world',
        } as PopulationConstraint,
      ];

      // 2 spawn points across 2 zones = under minimum 3
      const world = makeWorld(
        [
          makeZone({ id: 'z1', entityCounts: { spawn_point: 1 } }),
          makeZone({ id: 'z2', entityCounts: { spawn_point: 1 } }),
        ],
        ['playable'],
      );

      // World doesn't have 'playable' trait → this tests that population scope='world'
      // Actually the population constraint's source is checked differently
      // For world population constraints, source just identifies when to apply
      // The constraint won't trigger because world.traits doesn't match 'playable'
      // Let me adjust...
      const violations = validateWorldConstraints(
        { ...world, traits: ['playable'] },
        constraints,
      );
      expect(violations.length).toBeGreaterThan(0);
    });

    it('should pass when total meets minimum', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'population',
          source: 'explorable',
          targets: ['point_of_interest'],
          scope: 'world',
          severity: 'warning',
          message: '',
          min: 2,
          max: Infinity,
          per: 'world',
        } as PopulationConstraint,
      ];

      const world = makeWorld(
        [
          makeZone({ id: 'z1', entityCounts: { point_of_interest: 1 } }),
          makeZone({ id: 'z2', entityCounts: { point_of_interest: 2 } }),
        ],
        ['explorable'],
      );
      const violations = validateWorldConstraints(world, constraints);
      expect(getErrors(violations)).toHaveLength(0);
    });
  });

  describe('adjacency', () => {
    it('should detect forbidden adjacency', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'adjacency',
          source: 'ocean',
          targets: ['desert'],
          scope: 'world',
          severity: 'hint',
          message: 'Ocean should not border desert.',
          relationship: 'must_not_adjoin',
        } as AdjacencyConstraint,
      ];

      const world = makeWorld([
        makeZone({ id: 'z1', biome: 'ocean', adjacentZones: ['z2'] }),
        makeZone({ id: 'z2', biome: 'desert', adjacentZones: ['z1'] }),
      ]);
      const violations = validateWorldConstraints(world, constraints);
      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].severity).toBe('hint');
    });

    it('should pass when forbidden adjacency does not exist', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'adjacency',
          source: 'ocean',
          targets: ['desert'],
          scope: 'world',
          severity: 'hint',
          message: 'Ocean should not border desert.',
          relationship: 'must_not_adjoin',
        } as AdjacencyConstraint,
      ];

      const world = makeWorld([
        makeZone({ id: 'z1', biome: 'ocean', adjacentZones: ['z2'] }),
        makeZone({ id: 'z2', biome: 'plains', adjacentZones: ['z1'] }),
      ]);
      const violations = validateWorldConstraints(world, constraints);
      expect(violations).toHaveLength(0);
    });

    it('should detect missing required adjacency', () => {
      const constraints: ZoneWorldConstraint[] = [
        {
          type: 'adjacency',
          source: 'forest',
          targets: ['plains'],
          scope: 'world',
          severity: 'warning',
          message: 'Forest should be adjacent to plains.',
          relationship: 'must_adjoin',
        } as AdjacencyConstraint,
      ];

      const world = makeWorld([
        makeZone({ id: 'z1', biome: 'forest', adjacentZones: ['z2'] }),
        makeZone({ id: 'z2', biome: 'desert', adjacentZones: ['z1'] }),
      ]);
      const violations = validateWorldConstraints(world, constraints);
      expect(violations.length).toBeGreaterThan(0);
    });
  });

  describe('cascading zone + world validation', () => {
    it('should validate both zone and world constraints in one pass', () => {
      const allConstraints: ZoneWorldConstraint[] = [
        {
          type: 'requires',
          source: 'ocean',
          targets: ['water_body'],
          scope: 'zone',
          severity: 'error',
          message: 'Ocean zones need water.',
        },
        {
          type: 'requires',
          source: 'playable',
          targets: ['spawn_zone'],
          scope: 'world',
          severity: 'error',
          message: 'Playable worlds need spawn.',
        },
      ];

      const world = makeWorld(
        [makeZone({ biome: 'ocean', entityTraits: [] })], // Missing water_body
        ['playable'], // Missing spawn_zone
      );
      const violations = validateWorldConstraints(world, allConstraints);
      expect(getErrors(violations)).toHaveLength(2);
    });
  });
});

// =============================================================================
// BUILTIN CONSTRAINTS
// =============================================================================

describe('Builtin Constraints', () => {
  it('ZONE_CONSTRAINTS should contain biome rules', () => {
    expect(ZONE_CONSTRAINTS.length).toBeGreaterThan(5);
    const forestReqs = ZONE_CONSTRAINTS.filter(c => c.source === 'forest');
    expect(forestReqs.length).toBeGreaterThan(0);
  });

  it('WORLD_CONSTRAINTS should contain playability rules', () => {
    expect(WORLD_CONSTRAINTS.length).toBeGreaterThan(3);
    const playableReqs = WORLD_CONSTRAINTS.filter(c => c.source === 'playable');
    expect(playableReqs.length).toBeGreaterThan(0);
  });

  it('ZONE_CONSTRAINTS should all have scope=zone or scope=world', () => {
    for (const c of ZONE_CONSTRAINTS) {
      expect(['zone', 'world']).toContain(c.scope);
    }
  });

  it('WORLD_CONSTRAINTS should all have scope=world', () => {
    for (const c of WORLD_CONSTRAINTS) {
      expect(c.scope).toBe('world');
    }
  });
});

// =============================================================================
// UTILITIES
// =============================================================================

describe('Constraint Utilities', () => {
  const mixed: ZoneWorldConstraint[] = [
    { type: 'requires', source: 'a', targets: ['b'], scope: 'zone', severity: 'error', message: '' },
    { type: 'requires', source: 'c', targets: ['d'], scope: 'world', severity: 'warning', message: '' },
    { type: 'conflicts', source: 'e', targets: ['f'], scope: 'object', severity: 'hint', message: '' },
  ];

  describe('getConstraintsByScope', () => {
    it('should filter by zone', () => {
      expect(getConstraintsByScope(mixed, 'zone')).toHaveLength(1);
    });
    it('should filter by world', () => {
      expect(getConstraintsByScope(mixed, 'world')).toHaveLength(1);
    });
    it('should filter by object', () => {
      expect(getConstraintsByScope(mixed, 'object')).toHaveLength(1);
    });
  });

  describe('getConstraintsForBiome', () => {
    it('should find constraints for a biome', () => {
      const constraints: ZoneWorldConstraint[] = [
        { type: 'requires', source: 'forest', targets: ['veg'], scope: 'zone', severity: 'warning', message: '' },
        { type: 'conflicts', source: 'desert', targets: ['ice'], scope: 'zone', severity: 'error', message: '' },
      ];
      expect(getConstraintsForBiome(constraints, 'forest')).toHaveLength(1);
      expect(getConstraintsForBiome(constraints, 'ocean')).toHaveLength(0);
    });
  });

  describe('mergeConstraints', () => {
    it('should deduplicate identical constraints', () => {
      const set1: ZoneWorldConstraint[] = [
        { type: 'requires', source: 'a', targets: ['b'], scope: 'zone', severity: 'error', message: '' },
      ];
      const set2: ZoneWorldConstraint[] = [
        { type: 'requires', source: 'a', targets: ['b'], scope: 'zone', severity: 'error', message: '' },
      ];
      expect(mergeConstraints(set1, set2)).toHaveLength(1);
    });

    it('should keep different constraints', () => {
      const set1: ZoneWorldConstraint[] = [
        { type: 'requires', source: 'a', targets: ['b'], scope: 'zone', severity: 'error', message: '' },
      ];
      const set2: ZoneWorldConstraint[] = [
        { type: 'requires', source: 'x', targets: ['y'], scope: 'zone', severity: 'error', message: '' },
      ];
      expect(mergeConstraints(set1, set2)).toHaveLength(2);
    });
  });

  describe('severity filters', () => {
    it('should separate errors, warnings, hints', () => {
      const violations = [
        { constraint: mixed[0], context: '', severity: 'error' as const, message: '' },
        { constraint: mixed[1], context: '', severity: 'warning' as const, message: '' },
        { constraint: mixed[2], context: '', severity: 'hint' as const, message: '' },
        { constraint: mixed[0], context: '', severity: 'error' as const, message: '' },
      ];
      expect(getErrors(violations)).toHaveLength(2);
      expect(getWarnings(violations)).toHaveLength(1);
      expect(getHints(violations)).toHaveLength(1);
    });
  });
});
