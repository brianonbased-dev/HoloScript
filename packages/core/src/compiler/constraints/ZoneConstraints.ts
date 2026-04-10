/**
 * Zone-Level and World-Level Trait Constraints
 * biome_requires, biome_conflicts, ecological_coherence
 *
 * Extended capabilities:
 *   - Narrative constraint type (narrative_requires, narrative_conflicts)
 *   - Terrain compatibility validation (slope, altitude, moisture)
 *   - Seasonal variation rules
 *   - Constraint strength levels (hard / soft / preference)
 *   - Constraint composition (AND / OR groups)
 *
 * @version 2.0.0
 */

// ===========================================================================
// Core biome types and rules (preserved from v1)
// ===========================================================================

export type BiomeType =
  | 'forest'
  | 'desert'
  | 'ocean'
  | 'arctic'
  | 'urban'
  | 'cave'
  | 'mountain'
  | 'grassland'
  | 'volcanic'
  | 'swamp'
  | 'sky'
  | 'underwater';
export interface BiomeRule {
  biome: BiomeType;
  requiredTraits: string[];
  conflictingTraits: string[];
  maxEntities: number;
}
export interface EcologicalRule {
  traitA: string;
  traitB: string;
  relationship: 'symbiotic' | 'predator-prey' | 'competitive' | 'neutral';
  minDistance: number;
  maxDistance: number;
}
export interface ZoneConstraintResult {
  valid: boolean;
  violations: string[];
  warnings: string[];
}

export const DEFAULT_BIOME_RULES: BiomeRule[] = [
  {
    biome: 'ocean',
    requiredTraits: ['Buoyancy', 'WaterInteraction'],
    conflictingTraits: ['FireEffect', 'VolcanicTerrain'],
    maxEntities: 500,
  },
  {
    biome: 'arctic',
    requiredTraits: ['ColdResistance'],
    conflictingTraits: ['TropicalVegetation', 'DesertTerrain'],
    maxEntities: 200,
  },
  {
    biome: 'volcanic',
    requiredTraits: ['HeatResistance'],
    conflictingTraits: ['IceFormation', 'SnowCover'],
    maxEntities: 100,
  },
  {
    biome: 'forest',
    requiredTraits: [],
    conflictingTraits: ['DesertTerrain', 'LavaFlow'],
    maxEntities: 1000,
  },
  { biome: 'urban', requiredTraits: [], conflictingTraits: ['WildGrowth'], maxEntities: 2000 },
];

// ===========================================================================
// Constraint strength levels
// ===========================================================================

/**
 * Strength of a constraint.
 *
 * - `hard`       : Violation is an error; zone is invalid.
 * - `soft`       : Violation is a warning; zone is valid but flagged.
 * - `preference` : Violation is informational; no impact on validity.
 */
export type ConstraintStrength = 'hard' | 'soft' | 'preference';

// ===========================================================================
// Narrative constraints
// ===========================================================================

/**
 * Describes a story-coherence constraint between traits or entities.
 *
 * `narrative_requires`: traitA being present in a zone requires traitB
 *   to also be present somewhere in the same zone for story coherence.
 *
 * `narrative_conflicts`: traitA and traitB should never coexist in the
 *   same zone because they represent mutually exclusive story arcs.
 */
export type NarrativeRelation = 'narrative_requires' | 'narrative_conflicts';

export interface NarrativeConstraint {
  /** Human-readable label (e.g. "Dragon requires treasure hoard"). */
  label: string;
  /** The trait that triggers this constraint. */
  traitA: string;
  /** The trait that must (or must not) be present alongside traitA. */
  traitB: string;
  /** Whether traitB is required or conflicting when traitA is present. */
  relation: NarrativeRelation;
  /** Strength of the constraint. */
  strength: ConstraintStrength;
}

// ===========================================================================
// Terrain compatibility
// ===========================================================================

/** Physical terrain parameters at a given position. */
export interface TerrainParams {
  /** Slope angle in degrees (0 = flat, 90 = vertical). */
  slopeDeg: number;
  /** Altitude in metres above sea level. */
  altitudeM: number;
  /** Moisture level 0..1 (0 = arid, 1 = saturated). */
  moisture: number;
}

/** Allowed terrain ranges for an entity or trait. */
export interface TerrainCompatibility {
  /** Trait or entity name this applies to. */
  target: string;
  /** Min/max slope in degrees. */
  slopeRange: [number, number];
  /** Min/max altitude in metres. */
  altitudeRange: [number, number];
  /** Min/max moisture. */
  moistureRange: [number, number];
  /** Strength of violation. */
  strength: ConstraintStrength;
}

// ===========================================================================
// Seasonal variation rules
// ===========================================================================

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/**
 * A rule that only applies during certain seasons.
 *
 * During the active seasons the constraint acts as a biome-level
 * required/conflicting trait rule. Outside those seasons it is ignored.
 */
export interface SeasonalRule {
  /** Human-readable label. */
  label: string;
  /** Seasons during which this rule is active. */
  activeSeasons: Season[];
  /** Biome this rule applies to. */
  biome: BiomeType;
  /** Traits required during the active seasons. */
  requiredTraits: string[];
  /** Traits conflicting during the active seasons. */
  conflictingTraits: string[];
  /** Strength of the constraint. */
  strength: ConstraintStrength;
}

// ===========================================================================
// Constraint composition (AND / OR groups)
// ===========================================================================

/**
 * An individual atomic constraint evaluated to a boolean.
 */
export interface AtomicConstraint {
  type: 'atomic';
  /** Description of what is being checked. */
  description: string;
  /** Evaluation function. */
  evaluate: () => boolean;
  /** Strength of violation when evaluate() returns false. */
  strength: ConstraintStrength;
}

/**
 * A composite constraint combining children with AND or OR logic.
 *
 * - `and`: All children must pass for the group to pass.
 * - `or`:  At least one child must pass for the group to pass.
 */
export interface CompositeConstraint {
  type: 'and' | 'or';
  /** Human-readable description. */
  description: string;
  /** Child constraints (atomic or nested composites). */
  children: Array<AtomicConstraint | CompositeConstraint>;
  /** Strength used when the entire group fails. */
  strength: ConstraintStrength;
}

export type Constraint = AtomicConstraint | CompositeConstraint;

/**
 * Recursively evaluate a Constraint tree.
 *
 * Returns { pass: boolean; failures: string[] } where failures lists
 * human-readable descriptions of every failing leaf.
 */
export function evaluateConstraint(c: Constraint): { pass: boolean; failures: string[] } {
  if (c.type === 'atomic') {
    const ok = c.evaluate();
    return { pass: ok, failures: ok ? [] : [c.description] };
  }

  const childResults = c.children.map((ch) => evaluateConstraint(ch));

  if (c.type === 'and') {
    const allPass = childResults.every((r) => r.pass);
    const failures = childResults.flatMap((r) => r.failures);
    return { pass: allPass, failures: allPass ? [] : failures };
  }

  // 'or'
  const anyPass = childResults.some((r) => r.pass);
  const failures = anyPass ? [] : childResults.flatMap((r) => r.failures);
  return { pass: anyPass, failures };
}

// ===========================================================================
// Entity shape used across validators
// ===========================================================================

export interface ZoneEntity {
  name: string;
  traits: string[];
  position: [number, number, number];
  terrain?: TerrainParams;
}

// ===========================================================================
// ZoneConstraintValidator (extended)
// ===========================================================================

export class ZoneConstraintValidator {
  private biomeRules: Map<BiomeType, BiomeRule> = new Map();
  private ecologicalRules: EcologicalRule[] = [];
  private narrativeConstraints: NarrativeConstraint[] = [];
  private terrainCompatibilities: TerrainCompatibility[] = [];
  private seasonalRules: SeasonalRule[] = [];
  private currentSeason: Season = 'spring';

  constructor(customRules?: BiomeRule[], ecoRules?: EcologicalRule[]) {
    for (const r of customRules ?? DEFAULT_BIOME_RULES) this.biomeRules.set(r.biome, r);
    this.ecologicalRules = ecoRules ?? [];
  }

  // -----------------------------------------------------------------------
  // Biome rules (preserved from v1)
  // -----------------------------------------------------------------------

  addBiomeRule(rule: BiomeRule): void {
    this.biomeRules.set(rule.biome, rule);
  }
  addEcologicalRule(rule: EcologicalRule): void {
    this.ecologicalRules.push(rule);
  }

  // -----------------------------------------------------------------------
  // Narrative constraints
  // -----------------------------------------------------------------------

  addNarrativeConstraint(constraint: NarrativeConstraint): void {
    this.narrativeConstraints.push(constraint);
  }

  removeNarrativeConstraint(label: string): boolean {
    const idx = this.narrativeConstraints.findIndex((nc) => nc.label === label);
    if (idx === -1) return false;
    this.narrativeConstraints.splice(idx, 1);
    return true;
  }

  getNarrativeConstraints(): ReadonlyArray<NarrativeConstraint> {
    return this.narrativeConstraints;
  }

  // -----------------------------------------------------------------------
  // Terrain compatibility
  // -----------------------------------------------------------------------

  addTerrainCompatibility(compat: TerrainCompatibility): void {
    this.terrainCompatibilities.push(compat);
  }

  removeTerrainCompatibility(target: string): boolean {
    const idx = this.terrainCompatibilities.findIndex((tc) => tc.target === target);
    if (idx === -1) return false;
    this.terrainCompatibilities.splice(idx, 1);
    return true;
  }

  // -----------------------------------------------------------------------
  // Seasonal rules
  // -----------------------------------------------------------------------

  addSeasonalRule(rule: SeasonalRule): void {
    this.seasonalRules.push(rule);
  }

  removeSeasonalRule(label: string): boolean {
    const idx = this.seasonalRules.findIndex((sr) => sr.label === label);
    if (idx === -1) return false;
    this.seasonalRules.splice(idx, 1);
    return true;
  }

  setSeason(season: Season): void {
    this.currentSeason = season;
  }

  getSeason(): Season {
    return this.currentSeason;
  }

  // -----------------------------------------------------------------------
  // Zone validation (v1, preserved)
  // -----------------------------------------------------------------------

  validateZone(
    biome: BiomeType,
    entities: Array<{ name: string; traits: string[] }>
  ): ZoneConstraintResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    const rule = this.biomeRules.get(biome);
    if (!rule) {
      warnings.push(`No rules defined for biome '${biome}'`);
      return { valid: true, violations, warnings };
    }
    if (entities.length > rule.maxEntities)
      violations.push(
        `Zone '${biome}' has ${entities.length} entities, max is ${rule.maxEntities}`
      );
    for (const entity of entities) {
      for (const conflict of rule.conflictingTraits) {
        if (entity.traits.includes(conflict))
          violations.push(
            `Entity '${entity.name}' has conflicting trait '${conflict}' for biome '${biome}'`
          );
      }
      if (rule.requiredTraits.length > 0) {
        const hasRequired = rule.requiredTraits.some((t) => entity.traits.includes(t));
        if (!hasRequired)
          warnings.push(
            `Entity '${entity.name}' in '${biome}' lacks required traits: ${rule.requiredTraits.join(', ')}`
          );
      }
    }
    return { valid: violations.length === 0, violations, warnings };
  }

  // -----------------------------------------------------------------------
  // Ecological coherence (v1, preserved)
  // -----------------------------------------------------------------------

  validateEcologicalCoherence(
    entities: Array<{ name: string; traits: string[]; position: [number, number, number] }>
  ): ZoneConstraintResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    for (const rule of this.ecologicalRules) {
      const groupA = entities.filter((e) => e.traits.includes(rule.traitA));
      const groupB = entities.filter((e) => e.traits.includes(rule.traitB));
      for (const a of groupA)
        for (const b of groupB) {
          const d = Math.sqrt(
            (a.position[0] - b.position[0]) ** 2 +
              (a.position[1] - b.position[1]) ** 2 +
              (a.position[2] - b.position[2]) ** 2
          );
          if (d < rule.minDistance)
            violations.push(
              `'${a.name}' (${rule.traitA}) too close to '${b.name}' (${rule.traitB}): ${d.toFixed(1)}m < ${rule.minDistance}m`
            );
          if (d > rule.maxDistance && rule.relationship === 'symbiotic')
            warnings.push(
              `Symbiotic pair '${a.name}'/'${b.name}' too far apart: ${d.toFixed(1)}m > ${rule.maxDistance}m`
            );
        }
    }
    return { valid: violations.length === 0, violations, warnings };
  }

  // -----------------------------------------------------------------------
  // Narrative coherence validation (NEW)
  // -----------------------------------------------------------------------

  /**
   * Validate narrative constraints across all entities in a zone.
   *
   * For each narrative constraint:
   * - `narrative_requires`: If any entity has traitA, at least one entity
   *   in the zone must have traitB.
   * - `narrative_conflicts`: If any entity has traitA, no entity in the
   *   zone may have traitB.
   */
  validateNarrativeCoherence(
    entities: Array<{ name: string; traits: string[] }>
  ): ZoneConstraintResult {
    const violations: string[] = [];
    const warnings: string[] = [];
    const allTraits = new Set(entities.flatMap((e) => e.traits));

    for (const nc of this.narrativeConstraints) {
      const hasA = allTraits.has(nc.traitA);
      if (!hasA) continue;

      const hasB = allTraits.has(nc.traitB);

      if (nc.relation === 'narrative_requires' && !hasB) {
        const msg = `[${nc.label}] Narrative requires '${nc.traitB}' when '${nc.traitA}' is present`;
        this.pushByStrength(nc.strength, msg, violations, warnings);
      }

      if (nc.relation === 'narrative_conflicts' && hasB) {
        const msg = `[${nc.label}] Narrative conflict: '${nc.traitA}' and '${nc.traitB}' cannot coexist`;
        this.pushByStrength(nc.strength, msg, violations, warnings);
      }
    }

    return { valid: violations.length === 0, violations, warnings };
  }

  // -----------------------------------------------------------------------
  // Terrain compatibility validation (NEW)
  // -----------------------------------------------------------------------

  /**
   * Validate that each entity's terrain parameters fall within the
   * acceptable ranges defined by its terrain compatibility rules.
   */
  validateTerrainCompatibility(entities: ZoneEntity[]): ZoneConstraintResult {
    const violations: string[] = [];
    const warnings: string[] = [];

    for (const entity of entities) {
      if (!entity.terrain) continue;

      for (const compat of this.terrainCompatibilities) {
        // Check if this compatibility rule applies to this entity (by trait match)
        if (!entity.traits.includes(compat.target) && entity.name !== compat.target) continue;

        const t = entity.terrain;

        if (t.slopeDeg < compat.slopeRange[0] || t.slopeDeg > compat.slopeRange[1]) {
          const msg = `Entity '${entity.name}' slope ${t.slopeDeg.toFixed(1)}deg outside allowed range [${compat.slopeRange[0]}, ${compat.slopeRange[1]}] for '${compat.target}'`;
          this.pushByStrength(compat.strength, msg, violations, warnings);
        }

        if (t.altitudeM < compat.altitudeRange[0] || t.altitudeM > compat.altitudeRange[1]) {
          const msg = `Entity '${entity.name}' altitude ${t.altitudeM.toFixed(1)}m outside allowed range [${compat.altitudeRange[0]}, ${compat.altitudeRange[1]}] for '${compat.target}'`;
          this.pushByStrength(compat.strength, msg, violations, warnings);
        }

        if (t.moisture < compat.moistureRange[0] || t.moisture > compat.moistureRange[1]) {
          const msg = `Entity '${entity.name}' moisture ${t.moisture.toFixed(2)} outside allowed range [${compat.moistureRange[0]}, ${compat.moistureRange[1]}] for '${compat.target}'`;
          this.pushByStrength(compat.strength, msg, violations, warnings);
        }
      }
    }

    return { valid: violations.length === 0, violations, warnings };
  }

  // -----------------------------------------------------------------------
  // Seasonal rule validation (NEW)
  // -----------------------------------------------------------------------

  /**
   * Validate seasonal rules for the current season.
   *
   * Seasonal rules act like temporary biome rules: they add required or
   * conflicting traits that only apply during specific seasons.
   */
  validateSeasonalRules(
    biome: BiomeType,
    entities: Array<{ name: string; traits: string[] }>
  ): ZoneConstraintResult {
    const violations: string[] = [];
    const warnings: string[] = [];

    const activeRules = this.seasonalRules.filter(
      (sr) => sr.biome === biome && sr.activeSeasons.includes(this.currentSeason)
    );

    for (const sr of activeRules) {
      for (const entity of entities) {
        for (const conflict of sr.conflictingTraits) {
          if (entity.traits.includes(conflict)) {
            const msg = `[${sr.label}] Entity '${entity.name}' has trait '${conflict}' which conflicts in '${biome}' during ${this.currentSeason}`;
            this.pushByStrength(sr.strength, msg, violations, warnings);
          }
        }
        if (sr.requiredTraits.length > 0) {
          const hasRequired = sr.requiredTraits.some((t) => entity.traits.includes(t));
          if (!hasRequired) {
            const msg = `[${sr.label}] Entity '${entity.name}' in '${biome}' lacks seasonal required traits [${sr.requiredTraits.join(', ')}] during ${this.currentSeason}`;
            this.pushByStrength(sr.strength, msg, violations, warnings);
          }
        }
      }
    }

    return { valid: violations.length === 0, violations, warnings };
  }

  // -----------------------------------------------------------------------
  // Composite constraint validation (NEW)
  // -----------------------------------------------------------------------

  /**
   * Evaluate a constraint tree (AND / OR groups of atomic checks)
   * and return a standard ZoneConstraintResult.
   */
  validateComposite(constraint: Constraint): ZoneConstraintResult {
    const violations: string[] = [];
    const warnings: string[] = [];

    const { pass, failures } = evaluateConstraint(constraint);

    if (!pass) {
      for (const failMsg of failures) {
        this.pushByStrength(constraint.strength, failMsg, violations, warnings);
      }
    }

    return { valid: violations.length === 0, violations, warnings };
  }

  // -----------------------------------------------------------------------
  // Full validation (combines all constraint types)
  // -----------------------------------------------------------------------

  /**
   * Run ALL constraint checks (biome, ecological, narrative, terrain,
   * seasonal) and merge the results into a single ZoneConstraintResult.
   */
  validateAll(biome: BiomeType, entities: ZoneEntity[]): ZoneConstraintResult {
    const results: ZoneConstraintResult[] = [];

    results.push(this.validateZone(biome, entities));
    results.push(this.validateEcologicalCoherence(entities));
    results.push(this.validateNarrativeCoherence(entities));
    results.push(this.validateTerrainCompatibility(entities));
    results.push(this.validateSeasonalRules(biome, entities));

    return this.mergeResults(results);
  }

  // -----------------------------------------------------------------------
  // Internal helpers
  // -----------------------------------------------------------------------

  /** Push a message to violations (hard) or warnings (soft/preference) based on strength. */
  private pushByStrength(
    strength: ConstraintStrength,
    msg: string,
    violations: string[],
    warnings: string[]
  ): void {
    if (strength === 'hard') {
      violations.push(msg);
    } else {
      // soft and preference both produce warnings
      const prefix = strength === 'preference' ? '[preference] ' : '';
      warnings.push(prefix + msg);
    }
  }

  /** Merge multiple ZoneConstraintResults into one. */
  private mergeResults(results: ZoneConstraintResult[]): ZoneConstraintResult {
    const violations = results.flatMap((r) => r.violations);
    const warnings = results.flatMap((r) => r.warnings);
    return { valid: violations.length === 0, violations, warnings };
  }
}
