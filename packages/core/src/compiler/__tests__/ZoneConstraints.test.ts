import { describe, it, expect } from 'vitest';
import {
  ZoneConstraintValidator,
  evaluateConstraint,
  DEFAULT_BIOME_RULES,
  type BiomeRule,
  type EcologicalRule,
  type NarrativeConstraint,
  type TerrainCompatibility,
  type SeasonalRule,
  type ZoneEntity,
  type AtomicConstraint,
  type CompositeConstraint,
} from '../constraints/ZoneConstraints';

// ─── Biome Validation ──────────────────────────────────────────────────

describe('ZoneConstraintValidator — biome rules', () => {
  it('validates a valid zone with default rules', () => {
    const validator = new ZoneConstraintValidator();
    const result = validator.validateZone('forest', [
      { name: 'tree1', traits: ['TreeGrowth'] },
      { name: 'deer', traits: ['Wildlife'] },
    ]);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('detects conflicting traits for biome', () => {
    const validator = new ZoneConstraintValidator();
    const result = validator.validateZone('ocean', [
      { name: 'fireball', traits: ['FireEffect'] },
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('FireEffect'))).toBe(true);
  });

  it('detects entity count exceeding maxEntities', () => {
    const entities = Array.from({ length: 101 }, (_, i) => ({
      name: `entity${i}`,
      traits: ['HeatResistance'],
    }));
    const validator = new ZoneConstraintValidator();
    const result = validator.validateZone('volcanic', entities);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('max is 100'))).toBe(true);
  });

  it('warns when entity lacks required traits', () => {
    const validator = new ZoneConstraintValidator();
    const result = validator.validateZone('ocean', [
      { name: 'diver', traits: [] }, // Missing WaterInteraction/Buoyancy
    ]);
    expect(result.warnings.some((w) => w.includes('lacks required traits'))).toBe(true);
  });

  it('handles unknown biome with warning', () => {
    const validator = new ZoneConstraintValidator();
    const result = validator.validateZone('alien' as any, [
      { name: 'x', traits: [] },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings.some((w) => w.includes("No rules defined for biome 'alien'"))).toBe(true);
  });

  it('supports custom biome rules via constructor', () => {
    const customRules: BiomeRule[] = [
      { biome: 'cave', requiredTraits: ['DarkVision'], conflictingTraits: ['SunFlower'], maxEntities: 50 },
    ];
    const validator = new ZoneConstraintValidator(customRules);
    const result = validator.validateZone('cave', [
      { name: 'bat', traits: ['DarkVision'] },
    ]);
    expect(result.valid).toBe(true);
  });

  it('addBiomeRule overrides existing rule', () => {
    const validator = new ZoneConstraintValidator();
    validator.addBiomeRule({
      biome: 'forest',
      requiredTraits: ['MagicAura'],
      conflictingTraits: [],
      maxEntities: 5,
    });
    const result = validator.validateZone('forest', [
      { name: 'elf', traits: [] },
    ]);
    expect(result.warnings.some((w) => w.includes('MagicAura'))).toBe(true);
  });
});

// ─── Ecological Coherence ──────────────────────────────────────────────

describe('ZoneConstraintValidator — ecological coherence', () => {
  it('detects entities too close based on ecological rules', () => {
    const ecoRules: EcologicalRule[] = [
      {
        traitA: 'Predator',
        traitB: 'Nest',
        relationship: 'predator-prey',
        minDistance: 10,
        maxDistance: 100,
      },
    ];
    const validator = new ZoneConstraintValidator(undefined, ecoRules);
    const result = validator.validateEcologicalCoherence([
      { name: 'wolf', traits: ['Predator'], position: [0, 0, 0] },
      { name: 'nest1', traits: ['Nest'], position: [1, 0, 0] }, // distance = 1 < minDistance 10
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('too close'))).toBe(true);
  });

  it('warns for symbiotic pairs too far apart', () => {
    const ecoRules: EcologicalRule[] = [
      {
        traitA: 'Flower',
        traitB: 'Bee',
        relationship: 'symbiotic',
        minDistance: 0,
        maxDistance: 5,
      },
    ];
    const validator = new ZoneConstraintValidator(undefined, ecoRules);
    const result = validator.validateEcologicalCoherence([
      { name: 'flower1', traits: ['Flower'], position: [0, 0, 0] },
      { name: 'bee1', traits: ['Bee'], position: [100, 0, 0] }, // distance = 100 > maxDistance 5
    ]);
    expect(result.warnings.some((w) => w.includes('too far apart'))).toBe(true);
  });

  it('passes when ecological distances are within bounds', () => {
    const ecoRules: EcologicalRule[] = [
      { traitA: 'A', traitB: 'B', relationship: 'neutral', minDistance: 1, maxDistance: 100 },
    ];
    const validator = new ZoneConstraintValidator(undefined, ecoRules);
    const result = validator.validateEcologicalCoherence([
      { name: 'a1', traits: ['A'], position: [0, 0, 0] },
      { name: 'b1', traits: ['B'], position: [5, 0, 0] },
    ]);
    expect(result.valid).toBe(true);
  });
});

// ─── Narrative Coherence ───────────────────────────────────────────────

describe('ZoneConstraintValidator — narrative constraints', () => {
  it('detects missing narrative requirement (hard)', () => {
    const validator = new ZoneConstraintValidator();
    validator.addNarrativeConstraint({
      label: 'Dragon needs Treasure',
      traitA: 'Dragon',
      traitB: 'TreasureHoard',
      relation: 'narrative_requires',
      strength: 'hard',
    });

    const result = validator.validateNarrativeCoherence([
      { name: 'dragon1', traits: ['Dragon'] },
      // No TreasureHoard present
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('Dragon needs Treasure'))).toBe(true);
  });

  it('passes when narrative requirement is satisfied', () => {
    const validator = new ZoneConstraintValidator();
    validator.addNarrativeConstraint({
      label: 'Dragon needs Treasure',
      traitA: 'Dragon',
      traitB: 'TreasureHoard',
      relation: 'narrative_requires',
      strength: 'hard',
    });

    const result = validator.validateNarrativeCoherence([
      { name: 'dragon1', traits: ['Dragon'] },
      { name: 'chest1', traits: ['TreasureHoard'] },
    ]);
    expect(result.valid).toBe(true);
  });

  it('detects narrative conflict', () => {
    const validator = new ZoneConstraintValidator();
    validator.addNarrativeConstraint({
      label: 'Peace vs War',
      traitA: 'PeaceAura',
      traitB: 'WarDrums',
      relation: 'narrative_conflicts',
      strength: 'hard',
    });

    const result = validator.validateNarrativeCoherence([
      { name: 'temple', traits: ['PeaceAura'] },
      { name: 'camp', traits: ['WarDrums'] },
    ]);
    expect(result.valid).toBe(false);
  });

  it('soft constraint produces warning instead of violation', () => {
    const validator = new ZoneConstraintValidator();
    validator.addNarrativeConstraint({
      label: 'Mood conflict',
      traitA: 'Happy',
      traitB: 'Gloomy',
      relation: 'narrative_conflicts',
      strength: 'soft',
    });

    const result = validator.validateNarrativeCoherence([
      { name: 'a', traits: ['Happy'] },
      { name: 'b', traits: ['Gloomy'] },
    ]);
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('removes narrative constraint by label', () => {
    const validator = new ZoneConstraintValidator();
    validator.addNarrativeConstraint({
      label: 'TestRule',
      traitA: 'A',
      traitB: 'B',
      relation: 'narrative_requires',
      strength: 'hard',
    });
    expect(validator.removeNarrativeConstraint('TestRule')).toBe(true);
    expect(validator.removeNarrativeConstraint('NonExistent')).toBe(false);
    expect(validator.getNarrativeConstraints()).toHaveLength(0);
  });
});

// ─── Terrain Compatibility ─────────────────────────────────────────────

describe('ZoneConstraintValidator — terrain compatibility', () => {
  it('detects slope out of range', () => {
    const validator = new ZoneConstraintValidator();
    validator.addTerrainCompatibility({
      target: 'Tree',
      slopeRange: [0, 30],
      altitudeRange: [0, 3000],
      moistureRange: [0.2, 1.0],
      strength: 'hard',
    });

    const result = validator.validateTerrainCompatibility([
      {
        name: 'pine',
        traits: ['Tree'],
        position: [0, 0, 0],
        terrain: { slopeDeg: 45, altitudeM: 100, moisture: 0.5 },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('slope'))).toBe(true);
  });

  it('detects altitude out of range', () => {
    const validator = new ZoneConstraintValidator();
    validator.addTerrainCompatibility({
      target: 'Coral',
      slopeRange: [0, 90],
      altitudeRange: [-100, 0],
      moistureRange: [0, 1],
      strength: 'hard',
    });

    const result = validator.validateTerrainCompatibility([
      {
        name: 'reef',
        traits: ['Coral'],
        position: [0, 0, 0],
        terrain: { slopeDeg: 5, altitudeM: 500, moisture: 1.0 },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('altitude'))).toBe(true);
  });

  it('detects moisture out of range', () => {
    const validator = new ZoneConstraintValidator();
    validator.addTerrainCompatibility({
      target: 'Cactus',
      slopeRange: [0, 90],
      altitudeRange: [0, 5000],
      moistureRange: [0, 0.2],
      strength: 'hard',
    });

    const result = validator.validateTerrainCompatibility([
      {
        name: 'cactus1',
        traits: ['Cactus'],
        position: [0, 0, 0],
        terrain: { slopeDeg: 5, altitudeM: 200, moisture: 0.8 },
      },
    ]);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes('moisture'))).toBe(true);
  });

  it('passes valid terrain parameters', () => {
    const validator = new ZoneConstraintValidator();
    validator.addTerrainCompatibility({
      target: 'Grass',
      slopeRange: [0, 45],
      altitudeRange: [0, 2000],
      moistureRange: [0.3, 0.9],
      strength: 'hard',
    });

    const result = validator.validateTerrainCompatibility([
      {
        name: 'grass1',
        traits: ['Grass'],
        position: [0, 0, 0],
        terrain: { slopeDeg: 10, altitudeM: 500, moisture: 0.5 },
      },
    ]);
    expect(result.valid).toBe(true);
  });

  it('skips entities without terrain data', () => {
    const validator = new ZoneConstraintValidator();
    validator.addTerrainCompatibility({
      target: 'Grass',
      slopeRange: [0, 45],
      altitudeRange: [0, 2000],
      moistureRange: [0.3, 0.9],
      strength: 'hard',
    });

    const result = validator.validateTerrainCompatibility([
      { name: 'grass1', traits: ['Grass'], position: [0, 0, 0] },
    ]);
    expect(result.valid).toBe(true);
  });

  it('removeTerrainCompatibility works', () => {
    const validator = new ZoneConstraintValidator();
    validator.addTerrainCompatibility({
      target: 'X',
      slopeRange: [0, 10],
      altitudeRange: [0, 100],
      moistureRange: [0, 1],
      strength: 'hard',
    });
    expect(validator.removeTerrainCompatibility('X')).toBe(true);
    expect(validator.removeTerrainCompatibility('NonExistent')).toBe(false);
  });
});

// ─── Seasonal Rules ────────────────────────────────────────────────────

describe('ZoneConstraintValidator — seasonal rules', () => {
  it('enforces seasonal conflict during active season', () => {
    const validator = new ZoneConstraintValidator();
    validator.setSeason('winter');
    validator.addSeasonalRule({
      label: 'No flowers in winter',
      activeSeasons: ['winter'],
      biome: 'forest',
      requiredTraits: [],
      conflictingTraits: ['FlowerBlossom'],
      strength: 'hard',
    });

    const result = validator.validateSeasonalRules('forest', [
      { name: 'rose', traits: ['FlowerBlossom'] },
    ]);
    expect(result.valid).toBe(false);
  });

  it('ignores seasonal rule outside active season', () => {
    const validator = new ZoneConstraintValidator();
    validator.setSeason('summer');
    validator.addSeasonalRule({
      label: 'No flowers in winter',
      activeSeasons: ['winter'],
      biome: 'forest',
      requiredTraits: [],
      conflictingTraits: ['FlowerBlossom'],
      strength: 'hard',
    });

    const result = validator.validateSeasonalRules('forest', [
      { name: 'rose', traits: ['FlowerBlossom'] },
    ]);
    expect(result.valid).toBe(true);
  });

  it('enforces required traits per season', () => {
    const validator = new ZoneConstraintValidator();
    validator.setSeason('winter');
    validator.addSeasonalRule({
      label: 'Winter coat required',
      activeSeasons: ['winter', 'autumn'],
      biome: 'arctic',
      requiredTraits: ['WinterCoat'],
      conflictingTraits: [],
      strength: 'hard',
    });

    const result = validator.validateSeasonalRules('arctic', [
      { name: 'explorer', traits: [] },
    ]);
    expect(result.valid).toBe(false);
  });

  it('getSeason and setSeason work', () => {
    const validator = new ZoneConstraintValidator();
    expect(validator.getSeason()).toBe('spring');
    validator.setSeason('autumn');
    expect(validator.getSeason()).toBe('autumn');
  });

  it('removeSeasonalRule works', () => {
    const validator = new ZoneConstraintValidator();
    validator.addSeasonalRule({
      label: 'TestSeason',
      activeSeasons: ['summer'],
      biome: 'desert',
      requiredTraits: [],
      conflictingTraits: [],
      strength: 'soft',
    });
    expect(validator.removeSeasonalRule('TestSeason')).toBe(true);
    expect(validator.removeSeasonalRule('NonExistent')).toBe(false);
  });
});

// ─── Composite Constraints ─────────────────────────────────────────────

describe('evaluateConstraint', () => {
  it('evaluates atomic constraint that passes', () => {
    const c: AtomicConstraint = {
      type: 'atomic',
      description: 'always true',
      evaluate: () => true,
      strength: 'hard',
    };
    const result = evaluateConstraint(c);
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('evaluates atomic constraint that fails', () => {
    const c: AtomicConstraint = {
      type: 'atomic',
      description: 'always false',
      evaluate: () => false,
      strength: 'hard',
    };
    const result = evaluateConstraint(c);
    expect(result.pass).toBe(false);
    expect(result.failures).toEqual(['always false']);
  });

  it('evaluates AND composite — all must pass', () => {
    const c: CompositeConstraint = {
      type: 'and',
      description: 'both must pass',
      strength: 'hard',
      children: [
        { type: 'atomic', description: 'true', evaluate: () => true, strength: 'hard' },
        { type: 'atomic', description: 'false', evaluate: () => false, strength: 'hard' },
      ],
    };
    const result = evaluateConstraint(c);
    expect(result.pass).toBe(false);
    expect(result.failures).toContain('false');
  });

  it('evaluates OR composite — one must pass', () => {
    const c: CompositeConstraint = {
      type: 'or',
      description: 'one must pass',
      strength: 'hard',
      children: [
        { type: 'atomic', description: 'false', evaluate: () => false, strength: 'hard' },
        { type: 'atomic', description: 'true', evaluate: () => true, strength: 'hard' },
      ],
    };
    const result = evaluateConstraint(c);
    expect(result.pass).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it('evaluates nested composite constraints', () => {
    const c: CompositeConstraint = {
      type: 'and',
      description: 'nested',
      strength: 'hard',
      children: [
        { type: 'atomic', description: 'ok', evaluate: () => true, strength: 'hard' },
        {
          type: 'or',
          description: 'inner or',
          strength: 'hard',
          children: [
            { type: 'atomic', description: 'fail1', evaluate: () => false, strength: 'hard' },
            { type: 'atomic', description: 'pass1', evaluate: () => true, strength: 'hard' },
          ],
        },
      ],
    };
    expect(evaluateConstraint(c).pass).toBe(true);
  });
});

describe('ZoneConstraintValidator — validateComposite', () => {
  it('returns violations for hard-strength composite failure', () => {
    const validator = new ZoneConstraintValidator();
    const result = validator.validateComposite({
      type: 'atomic',
      description: 'check failed',
      evaluate: () => false,
      strength: 'hard',
    });
    expect(result.valid).toBe(false);
    expect(result.violations).toContain('check failed');
  });

  it('returns warnings for soft-strength composite failure', () => {
    const validator = new ZoneConstraintValidator();
    const result = validator.validateComposite({
      type: 'atomic',
      description: 'soft check failed',
      evaluate: () => false,
      strength: 'soft',
    });
    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── validateAll ───────────────────────────────────────────────────────

describe('ZoneConstraintValidator — validateAll', () => {
  it('merges results from all constraint types', () => {
    const validator = new ZoneConstraintValidator();
    validator.addNarrativeConstraint({
      label: 'Test',
      traitA: 'X',
      traitB: 'Y',
      relation: 'narrative_requires',
      strength: 'hard',
    });

    const entities: ZoneEntity[] = [
      { name: 'e1', traits: ['X'], position: [0, 0, 0] },
    ];

    const result = validator.validateAll('forest', entities);
    expect(result.valid).toBe(false); // narrative violation: X requires Y
    expect(result.violations.some((v) => v.includes('Test'))).toBe(true);
  });

  it('passes when all constraints satisfied', () => {
    const validator = new ZoneConstraintValidator();
    const entities: ZoneEntity[] = [
      { name: 'tree', traits: ['TreeGrowth'], position: [0, 0, 0] },
    ];
    const result = validator.validateAll('forest', entities);
    expect(result.valid).toBe(true);
  });
});

// ─── DEFAULT_BIOME_RULES ───────────────────────────────────────────────

describe('DEFAULT_BIOME_RULES', () => {
  it('has rules for ocean, arctic, volcanic, forest, urban', () => {
    const biomes = DEFAULT_BIOME_RULES.map((r) => r.biome);
    expect(biomes).toContain('ocean');
    expect(biomes).toContain('arctic');
    expect(biomes).toContain('volcanic');
    expect(biomes).toContain('forest');
    expect(biomes).toContain('urban');
  });
});
