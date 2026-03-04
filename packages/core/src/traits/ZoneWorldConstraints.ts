/**
 * @fileoverview Zone-Level and World-Level Trait Constraints for HoloScript
 * @module @holoscript/core/traits
 *
 * Extends the object-level BUILTIN_CONSTRAINTS to zone and world scope.
 * Enables the SemanticExpander compiler pass to generate coherent infinite worlds
 * by encoding biome compatibility, narrative requirements, and ecological rules
 * as compile-time constraints rather than post-validation checks.
 *
 * Three constraint scopes:
 * 1. Object-level  (existing BUILTIN_CONSTRAINTS) — "this box needs physics"
 * 2. Zone-level    (ZONE_CONSTRAINTS)             — "forests require trees, conflict with lava"
 * 3. World-level   (WORLD_CONSTRAINTS)            — "the world needs at least one spawn zone"
 *
 * Research basis:
 * - W.PROCGEN.02: Constraints AS Schema > Post-Validation (50x error reduction)
 * - P.PROCGEN.01: SemanticExpander Compiler Pass
 * - G.PROCGEN.01: Infinite-but-Meaningless vs Meaningful-but-Bounded
 *
 * TODO(P.PROCGEN.01): Build SemanticExpander compiler pass on top of this.
 *   This module provides the CONSTRAINT layer. SemanticExpander uses these
 *   constraints as generation schema: expand zones → validate against
 *   ZONE_CONSTRAINTS → expand world → validate WORLD_CONSTRAINTS → emit.
 *
 * TODO(W.SIG25.01): AVBD physics-aware population caps.
 *   SIGGRAPH 2025 Audience Choice: Augmented Vertex Block Descent solves
 *   millions of objects. Population constraints should scale to AVBD budgets.
 *   Current O(n²) AABB limits (G.PHYSICS.01) inform conservative caps.
 *
 * @version 1.0.0
 * @category procgen
 */

// =============================================================================
// ZONE CONSTRAINT TYPES
// =============================================================================

/**
 * Constraint scope — which level this constraint applies to.
 */
export type ConstraintScope = 'object' | 'zone' | 'world';

/**
 * Constraint enforcement mode.
 * - 'error'   — compilation fails if violated
 * - 'warning' — compiler warns but allows
 * - 'hint'    — IDE suggestion only
 */
export type ConstraintSeverity = 'error' | 'warning' | 'hint';

/**
 * Extended trait constraint with scope and severity.
 * Backward-compatible with TraitConstraint (scope defaults to 'object').
 */
export interface ScopedConstraint {
  /** Constraint type */
  type: 'requires' | 'conflicts' | 'oneof' | 'population' | 'adjacency';
  /** The trait/zone/biome being constrained */
  source: string;
  /** Related traits/zones/biomes */
  targets: string[];
  /** Scope level */
  scope: ConstraintScope;
  /** Error/warning/hint */
  severity: ConstraintSeverity;
  /** Human-readable error */
  message: string;
  /** IDE fix suggestion */
  suggestion?: string;
}

/**
 * Population constraint — requires a minimum/maximum count of entities
 * with a given trait within a zone or world.
 */
export interface PopulationConstraint extends ScopedConstraint {
  type: 'population';
  /** Minimum count required (0 = no minimum) */
  min: number;
  /** Maximum count allowed (Infinity = no maximum) */
  max: number;
  /** Per what unit (per zone, per world, per 100m²) */
  per: 'zone' | 'world' | 'area_100m2';
}

/**
 * Adjacency constraint — requires or forbids two zones from being neighbors.
 */
export interface AdjacencyConstraint extends ScopedConstraint {
  type: 'adjacency';
  /** Whether adjacent placement is required or forbidden */
  relationship: 'must_adjoin' | 'must_not_adjoin' | 'prefer_adjoin';
}

/**
 * Any zone/world constraint type.
 */
export type ZoneWorldConstraint = ScopedConstraint | PopulationConstraint | AdjacencyConstraint;

// =============================================================================
// BIOME TYPES (for zone-level constraints)
// =============================================================================

/**
 * Standard biome categories for zone classification.
 */
export type BiomeType =
  | 'forest' | 'desert' | 'ocean' | 'mountain' | 'plains'
  | 'tundra' | 'swamp' | 'volcanic' | 'cave' | 'urban'
  | 'underwater' | 'sky' | 'void' | 'cosmic'
  | 'custom';

/**
 * Zone metadata used in constraint validation.
 */
export interface ZoneMetadata {
  /** Zone identifier */
  id: string;
  /** Zone name */
  name: string;
  /** Biome classification */
  biome: BiomeType;
  /** Traits applied to this zone */
  traits: string[];
  /** Entity traits contained in this zone */
  entityTraits: string[];
  /** Adjacent zone IDs */
  adjacentZones: string[];
  /** Entity count by trait */
  entityCounts: Record<string, number>;
  /** Total entity count */
  totalEntities: number;
}

/**
 * World metadata used in constraint validation.
 */
export interface WorldMetadata {
  /** All zones in the world */
  zones: ZoneMetadata[];
  /** World-level traits */
  traits: string[];
  /** Narrative requirements */
  narrativeRequirements: string[];
}

// =============================================================================
// CONSTRAINT VALIDATION
// =============================================================================

/**
 * Result of validating a single constraint.
 */
export interface ConstraintViolation {
  /** The constraint that was violated */
  constraint: ZoneWorldConstraint;
  /** Specific context (zone name, entity, etc.) */
  context: string;
  /** Severity of the violation */
  severity: ConstraintSeverity;
  /** Human-readable description */
  message: string;
  /** Fix suggestion */
  suggestion?: string;
}

/**
 * Validate zone-level constraints against a zone's metadata.
 */
export function validateZoneConstraints(
  zone: ZoneMetadata,
  constraints: ZoneWorldConstraint[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (const c of constraints) {
    if (c.scope !== 'zone') continue;

    switch (c.type) {
      case 'requires': {
        // Zone has source trait → must also have all target traits/entities
        if (zone.traits.includes(c.source) || zone.biome === c.source) {
          for (const target of c.targets) {
            const hasTarget = zone.traits.includes(target)
              || zone.entityTraits.includes(target)
              || zone.biome === target;
            if (!hasTarget) {
              violations.push({
                constraint: c,
                context: `Zone "${zone.name}" (${zone.biome})`,
                severity: c.severity,
                message: c.message || `Zone with "${c.source}" requires "${target}"`,
                suggestion: c.suggestion,
              });
            }
          }
        }
        break;
      }

      case 'conflicts': {
        if (zone.traits.includes(c.source) || zone.biome === c.source) {
          for (const target of c.targets) {
            const hasConflict = zone.traits.includes(target)
              || zone.entityTraits.includes(target)
              || zone.biome === target;
            if (hasConflict) {
              violations.push({
                constraint: c,
                context: `Zone "${zone.name}" (${zone.biome})`,
                severity: c.severity,
                message: c.message || `Zone with "${c.source}" conflicts with "${target}"`,
                suggestion: c.suggestion,
              });
            }
          }
        }
        break;
      }

      case 'oneof': {
        const present = c.targets.filter(t =>
          zone.traits.includes(t) || zone.biome === t
        );
        if (present.length > 1) {
          violations.push({
            constraint: c,
            context: `Zone "${zone.name}" (${zone.biome})`,
            severity: c.severity,
            message: c.message || `Zone can only have one of: ${c.targets.join(', ')}`,
            suggestion: c.suggestion,
          });
        }
        break;
      }

      case 'population': {
        const pop = c as PopulationConstraint;
        if (pop.per !== 'zone') break;
        if (zone.traits.includes(pop.source) || zone.biome === pop.source) {
          for (const target of pop.targets) {
            const count = zone.entityCounts[target] ?? 0;
            if (count < pop.min) {
              violations.push({
                constraint: c,
                context: `Zone "${zone.name}" (${zone.biome})`,
                severity: c.severity,
                message: pop.message || `Zone "${zone.name}" requires at least ${pop.min} "${target}" entities (found ${count})`,
                suggestion: pop.suggestion,
              });
            }
            if (count > pop.max) {
              violations.push({
                constraint: c,
                context: `Zone "${zone.name}" (${zone.biome})`,
                severity: c.severity,
                message: pop.message || `Zone "${zone.name}" exceeds maximum ${pop.max} "${target}" entities (found ${count})`,
                suggestion: pop.suggestion,
              });
            }
          }
        }
        break;
      }

      case 'adjacency': {
        const adj = c as AdjacencyConstraint;
        if (zone.biome !== adj.source && !zone.traits.includes(adj.source)) break;
        for (const target of adj.targets) {
          // We'd need to look up adjacent zone biomes — deferred to world-level validation
        }
        break;
      }
    }
  }

  return violations;
}

/**
 * Validate world-level constraints across all zones.
 */
export function validateWorldConstraints(
  world: WorldMetadata,
  constraints: ZoneWorldConstraint[]
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Validate each zone individually
  for (const zone of world.zones) {
    violations.push(...validateZoneConstraints(zone, constraints));
  }

  // World-level constraints
  for (const c of constraints) {
    if (c.scope !== 'world') continue;

    switch (c.type) {
      case 'requires': {
        if (world.traits.includes(c.source)) {
          for (const target of c.targets) {
            const hasZoneWith = world.zones.some(z =>
              z.traits.includes(target) || z.biome === target || z.entityTraits.includes(target)
            );
            if (!hasZoneWith) {
              violations.push({
                constraint: c,
                context: 'World',
                severity: c.severity,
                message: c.message || `World requires at least one zone with "${target}"`,
                suggestion: c.suggestion,
              });
            }
          }
        }
        break;
      }

      case 'population': {
        const pop = c as PopulationConstraint;
        if (pop.per !== 'world') break;
        for (const target of pop.targets) {
          const total = world.zones.reduce((sum, z) => sum + (z.entityCounts[target] ?? 0), 0);
          if (total < pop.min) {
            violations.push({
              constraint: c,
              context: 'World',
              severity: c.severity,
              message: pop.message || `World requires at least ${pop.min} "${target}" entities (found ${total})`,
              suggestion: pop.suggestion,
            });
          }
          if (total > pop.max) {
            violations.push({
              constraint: c,
              context: 'World',
              severity: c.severity,
              message: pop.message || `World exceeds maximum ${pop.max} "${target}" entities (found ${total})`,
              suggestion: pop.suggestion,
            });
          }
        }
        break;
      }

      case 'adjacency': {
        const adj = c as AdjacencyConstraint;
        // Check adjacency relationships across all zones
        for (const zone of world.zones) {
          if (zone.biome !== adj.source && !zone.traits.includes(adj.source)) continue;

          for (const adjZoneId of zone.adjacentZones) {
            const adjZone = world.zones.find(z => z.id === adjZoneId);
            if (!adjZone) continue;

            for (const target of adj.targets) {
              const adjHasTarget = adjZone.biome === target || adjZone.traits.includes(target);

              if (adj.relationship === 'must_not_adjoin' && adjHasTarget) {
                violations.push({
                  constraint: c,
                  context: `Zone "${zone.name}" ↔ "${adjZone.name}"`,
                  severity: c.severity,
                  message: adj.message || `"${adj.source}" zone must not be adjacent to "${target}" zone`,
                  suggestion: adj.suggestion,
                });
              }

              if (adj.relationship === 'must_adjoin') {
                const hasRequiredNeighbor = zone.adjacentZones.some(nId => {
                  const n = world.zones.find(z => z.id === nId);
                  return n && (n.biome === target || n.traits.includes(target));
                });
                if (!hasRequiredNeighbor) {
                  violations.push({
                    constraint: c,
                    context: `Zone "${zone.name}"`,
                    severity: c.severity,
                    message: adj.message || `"${adj.source}" zone must be adjacent to at least one "${target}" zone`,
                    suggestion: adj.suggestion,
                  });
                  break; // Only report once per zone
                }
              }
            }
          }
        }
        break;
      }
    }
  }

  return violations;
}

// =============================================================================
// BUILTIN ZONE CONSTRAINTS
// =============================================================================

/**
 * Built-in zone-level constraints for biome coherence.
 * These encode ecological and physical rules that the SemanticExpander
 * must respect when generating zone content.
 */
export const ZONE_CONSTRAINTS: ZoneWorldConstraint[] = [
  // ---------------------------------------------------------------------------
  // BIOME CONTENT REQUIREMENTS
  // ---------------------------------------------------------------------------
  {
    type: 'requires',
    source: 'forest',
    targets: ['vegetation'],
    scope: 'zone',
    severity: 'warning',
    message: 'Forest zones should contain vegetation entities.',
    suggestion: 'Add @vegetation trait to tree/plant entities in this zone.',
  },
  {
    type: 'requires',
    source: 'ocean',
    targets: ['water_body'],
    scope: 'zone',
    severity: 'error',
    message: 'Ocean zones must contain a water body.',
    suggestion: 'Add a water_body entity to the ocean zone.',
  },
  {
    type: 'requires',
    source: 'urban',
    targets: ['structure'],
    scope: 'zone',
    severity: 'warning',
    message: 'Urban zones should contain structures (buildings, roads).',
    suggestion: 'Add @structure trait to building entities.',
  },
  {
    type: 'requires',
    source: 'volcanic',
    targets: ['hazardous'],
    scope: 'zone',
    severity: 'warning',
    message: 'Volcanic zones should be marked hazardous for agent path planning.',
    suggestion: 'Add @hazardous trait to the zone or lava entities.',
  },

  // ---------------------------------------------------------------------------
  // BIOME CONFLICTS
  // ---------------------------------------------------------------------------
  {
    type: 'conflicts',
    source: 'ocean',
    targets: ['vegetation'],
    scope: 'zone',
    severity: 'warning',
    message: 'Ocean zones typically do not contain land vegetation.',
    suggestion: 'Use @aquatic_vegetation for underwater plants, or move vegetation to a coastal zone.',
  },
  {
    type: 'conflicts',
    source: 'tundra',
    targets: ['tropical'],
    scope: 'zone',
    severity: 'error',
    message: 'Tundra zones cannot contain tropical elements.',
    suggestion: 'Remove @tropical trait or change zone biome.',
  },
  {
    type: 'conflicts',
    source: 'underwater',
    targets: ['fire', 'lava'],
    scope: 'zone',
    severity: 'error',
    message: 'Underwater zones cannot contain fire or lava.',
    suggestion: 'Remove fire/lava entities or change zone biome.',
  },
  {
    type: 'conflicts',
    source: 'void',
    targets: ['gravity', 'weather'],
    scope: 'zone',
    severity: 'warning',
    message: 'Void zones typically lack gravity and weather systems.',
    suggestion: 'Remove @gravity/@weather or use @artificial_gravity for space stations.',
  },

  // ---------------------------------------------------------------------------
  // BIOME EXCLUSIVITY
  // ---------------------------------------------------------------------------
  {
    type: 'oneof',
    source: 'biome_mode',
    targets: ['ocean', 'desert', 'tundra', 'volcanic'],
    scope: 'zone',
    severity: 'error',
    message: 'A zone can only have one primary biome from extreme types.',
    suggestion: 'Use transition zones (e.g., "coastal") to blend between biomes.',
  },

  // ---------------------------------------------------------------------------
  // ADJACENCY RULES (biome transitions)
  // ---------------------------------------------------------------------------
  {
    type: 'adjacency',
    source: 'ocean',
    targets: ['desert'],
    scope: 'world',
    severity: 'hint',
    relationship: 'must_not_adjoin',
    message: 'Ocean zones rarely border deserts directly; consider a coastal transition zone.',
    suggestion: 'Insert a "coastal" or "beach" transition zone between ocean and desert.',
  } as AdjacencyConstraint,
  {
    type: 'adjacency',
    source: 'tundra',
    targets: ['volcanic'],
    scope: 'world',
    severity: 'hint',
    relationship: 'must_not_adjoin',
    message: 'Tundra and volcanic zones rarely border each other.',
    suggestion: 'Insert a mountain transition zone between tundra and volcanic.',
  } as AdjacencyConstraint,
  {
    type: 'adjacency',
    source: 'forest',
    targets: ['plains'],
    scope: 'world',
    severity: 'hint',
    relationship: 'prefer_adjoin',
    message: 'Forests naturally transition to plains/meadows.',
  } as AdjacencyConstraint,
];

// =============================================================================
// BUILTIN WORLD CONSTRAINTS
// =============================================================================

/**
 * Built-in world-level constraints for narrative and structural coherence.
 * These ensure every generated world has the minimum elements needed
 * for gameplay, agent spawning, and player experience.
 */
export const WORLD_CONSTRAINTS: ZoneWorldConstraint[] = [
  // ---------------------------------------------------------------------------
  // STRUCTURAL REQUIREMENTS
  // ---------------------------------------------------------------------------
  {
    type: 'requires',
    source: 'playable',
    targets: ['spawn_zone'],
    scope: 'world',
    severity: 'error',
    message: 'Playable worlds must have at least one spawn zone.',
    suggestion: 'Add @spawn_zone trait to a safe zone where players appear.',
  },
  {
    type: 'requires',
    source: 'playable',
    targets: ['navigation_mesh'],
    scope: 'world',
    severity: 'warning',
    message: 'Playable worlds should have navigation mesh for AI pathfinding.',
    suggestion: 'Generate @navigation_mesh for walkable surfaces.',
  },
  {
    type: 'requires',
    source: 'multiplayer',
    targets: ['networked'],
    scope: 'world',
    severity: 'error',
    message: 'Multiplayer worlds must have networked state synchronization.',
    suggestion: 'Add @networked trait to the world composition.',
  },

  // ---------------------------------------------------------------------------
  // POPULATION REQUIREMENTS
  // ---------------------------------------------------------------------------
  {
    type: 'population',
    source: 'playable',
    targets: ['spawn_point'],
    scope: 'world',
    severity: 'error',
    message: 'Playable worlds need at least 1 spawn point.',
    suggestion: 'Add entities with @spawn_point trait.',
    min: 1,
    max: Infinity,
    per: 'world',
  } as PopulationConstraint,
  {
    type: 'population',
    source: 'explorable',
    targets: ['point_of_interest'],
    scope: 'world',
    severity: 'warning',
    message: 'Explorable worlds should have at least 3 points of interest.',
    suggestion: 'Add @point_of_interest trait to landmarks, dungeons, or unique locations.',
    min: 3,
    max: Infinity,
    per: 'world',
  } as PopulationConstraint,

  // ---------------------------------------------------------------------------
  // NARRATIVE COHERENCE
  // ---------------------------------------------------------------------------
  {
    type: 'requires',
    source: 'narrative',
    targets: ['quest_giver'],
    scope: 'world',
    severity: 'warning',
    message: 'Narrative worlds should have at least one quest giver.',
    suggestion: 'Add an NPC with @quest_giver trait.',
  },
  {
    type: 'requires',
    source: 'economy',
    targets: ['marketplace'],
    scope: 'world',
    severity: 'warning',
    message: 'Economy-enabled worlds should have at least one marketplace zone.',
    suggestion: 'Add a zone with @marketplace trait for trade.',
  },

  // ---------------------------------------------------------------------------
  // SAFETY
  // ---------------------------------------------------------------------------
  {
    type: 'population',
    source: 'playable',
    targets: ['hazardous'],
    scope: 'world',
    severity: 'warning',
    message: 'Worlds should not have more than 60% hazardous zones.',
    suggestion: 'Add safe zones to balance world difficulty.',
    min: 0,
    max: Infinity, // Validated as percentage externally
    per: 'world',
  } as PopulationConstraint,
];

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Get all constraints for a given scope.
 */
export function getConstraintsByScope(
  constraints: ZoneWorldConstraint[],
  scope: ConstraintScope
): ZoneWorldConstraint[] {
  return constraints.filter(c => c.scope === scope);
}

/**
 * Get all constraints relevant to a specific biome.
 */
export function getConstraintsForBiome(
  constraints: ZoneWorldConstraint[],
  biome: BiomeType
): ZoneWorldConstraint[] {
  return constraints.filter(c =>
    c.source === biome || c.targets.includes(biome)
  );
}

/**
 * Merge multiple constraint sets, deduplicating by source+targets+scope.
 */
export function mergeConstraints(
  ...sets: ZoneWorldConstraint[][]
): ZoneWorldConstraint[] {
  const seen = new Set<string>();
  const result: ZoneWorldConstraint[] = [];

  for (const set of sets) {
    for (const c of set) {
      const key = `${c.scope}:${c.type}:${c.source}:${c.targets.sort().join(',')}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
  }

  return result;
}

/**
 * Filter violations by severity.
 */
export function getErrors(violations: ConstraintViolation[]): ConstraintViolation[] {
  return violations.filter(v => v.severity === 'error');
}

export function getWarnings(violations: ConstraintViolation[]): ConstraintViolation[] {
  return violations.filter(v => v.severity === 'warning');
}

export function getHints(violations: ConstraintViolation[]): ConstraintViolation[] {
  return violations.filter(v => v.severity === 'hint');
}
