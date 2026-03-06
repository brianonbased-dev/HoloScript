/**
 * Spatial Training Data Generator
 *
 * Generates labeled spatial reasoning examples from HoloScript compositions
 * with spatial constraints (spatial_adjacent, spatial_contains, spatial_reachable).
 *
 * Outputs instruction-response pairs in JSONL format suitable for fine-tuning
 * LLMs on spatial reasoning tasks.
 *
 * Features:
 * - 12+ instruction templates per spatial relationship type (per G.002 mandate)
 * - Randomized scene parameters (object counts, positions, scales, relationships)
 * - Both positive and negative examples for each spatial relationship type
 * - Configurable difficulty levels (basic, intermediate, advanced)
 *
 * @module training/SpatialTrainingDataGenerator
 */

import type {
  SpatialDifficulty,
  SpatialRelationshipType,
  SceneObject,
  SpatialRelationship,
  SpatialScene,
  SpatialTrainingExample,
  SpatialGeneratorConfig,
  SpatialGeneratorStats,
  SpatialTrainingJSONLEntry,
} from './SpatialTrainingDataTypes';

// =============================================================================
// SEEDED RANDOM NUMBER GENERATOR
// =============================================================================

/**
 * Simple seeded PRNG (Mulberry32) for reproducible generation.
 */
class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed;
  }

  /** Returns a float in [0, 1) */
  next(): number {
    this.state |= 0;
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns an integer in [min, max] inclusive */
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns a float in [min, max) */
  float(min: number, max: number): number {
    return this.next() * (max - min) + min;
  }

  /** Picks a random element from an array */
  pick<T>(array: T[]): T {
    return array[this.int(0, array.length - 1)];
  }

  /** Shuffles an array in place */
  shuffle<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// =============================================================================
// TEMPLATE POOLS (12+ per relationship type, per G.002 mandate)
// =============================================================================

/**
 * Instruction templates for spatial_adjacent relationship.
 * Each template has a question and answer format with placeholders.
 */
const ADJACENT_QUESTION_TEMPLATES: Array<{
  question: (src: string, tgt: string, dist: number, maxDist: number) => string;
  positiveAnswer: (src: string, tgt: string, dist: number, maxDist: number) => string;
  negativeAnswer: (src: string, tgt: string, dist: number, maxDist: number) => string;
}> = [
  {
    question: (src, tgt, _d, maxDist) =>
      `Is "${src}" within ${maxDist}m of "${tgt}" in this scene?`,
    positiveAnswer: (src, tgt, dist, maxDist) =>
      `Yes. "${src}" is ${dist.toFixed(1)}m from "${tgt}", which is within the ${maxDist}m adjacency constraint.`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `No. "${src}" is ${dist.toFixed(1)}m from "${tgt}", which exceeds the ${maxDist}m adjacency constraint.`,
  },
  {
    question: (src, tgt) =>
      `Are "${src}" and "${tgt}" adjacent to each other?`,
    positiveAnswer: (src, tgt, dist) =>
      `Yes, "${src}" and "${tgt}" are adjacent. They are ${dist.toFixed(1)}m apart, satisfying the adjacency constraint.`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `No, "${src}" and "${tgt}" are not adjacent. At ${dist.toFixed(1)}m apart, they exceed the ${maxDist}m maximum distance.`,
  },
  {
    question: (src, tgt, _d, maxDist) =>
      `Does the spatial_adjacent constraint between "${src}" and "${tgt}" (maxDistance: ${maxDist}m) pass?`,
    positiveAnswer: (src, tgt, dist, maxDist) =>
      `The constraint passes. The distance between "${src}" and "${tgt}" is ${dist.toFixed(1)}m, within the ${maxDist}m limit.`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `The constraint fails. The distance between "${src}" and "${tgt}" is ${dist.toFixed(1)}m, exceeding the ${maxDist}m limit.`,
  },
  {
    question: (src, tgt) =>
      `What is the spatial relationship between "${src}" and "${tgt}"? Are they close enough to interact?`,
    positiveAnswer: (src, tgt, dist) =>
      `"${src}" and "${tgt}" are close enough to interact. They are ${dist.toFixed(1)}m apart, within the adjacency threshold.`,
    negativeAnswer: (src, tgt, dist) =>
      `"${src}" and "${tgt}" are too far apart to interact. At ${dist.toFixed(1)}m apart, they fail the adjacency check.`,
  },
  {
    question: (src, tgt, _d, maxDist) =>
      `Can "${src}" reach "${tgt}" given the ${maxDist}m adjacency requirement?`,
    positiveAnswer: (src, tgt, dist) =>
      `Yes, "${src}" can reach "${tgt}". The current distance of ${dist.toFixed(1)}m satisfies the adjacency requirement.`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `No, "${src}" cannot reach "${tgt}". The ${dist.toFixed(1)}m distance exceeds the ${maxDist}m requirement.`,
  },
  {
    question: (src, tgt) =>
      `In this HoloScript composition, evaluate whether "${src}" satisfies its adjacency constraint with "${tgt}".`,
    positiveAnswer: (src, tgt, dist, maxDist) =>
      `The adjacency constraint is satisfied. "${src}" is ${dist.toFixed(1)}m from "${tgt}" (max allowed: ${maxDist}m).`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `The adjacency constraint is violated. "${src}" is ${dist.toFixed(1)}m from "${tgt}" but must be within ${maxDist}m.`,
  },
  {
    question: (_src, _tgt, _d, maxDist) =>
      `Which objects in this scene are within ${maxDist}m of each other?`,
    positiveAnswer: (src, tgt, dist) =>
      `"${src}" and "${tgt}" are within range at ${dist.toFixed(1)}m apart.`,
    negativeAnswer: (src, tgt, dist) =>
      `"${src}" and "${tgt}" are NOT within range. They are ${dist.toFixed(1)}m apart.`,
  },
  {
    question: (src, tgt) =>
      `If I move "${src}" to its current position, will it still be adjacent to "${tgt}"?`,
    positiveAnswer: (_src, _tgt, dist, maxDist) =>
      `Yes, at its current position the distance is ${dist.toFixed(1)}m, which maintains adjacency (max: ${maxDist}m).`,
    negativeAnswer: (_src, _tgt, dist, maxDist) =>
      `No, at its current position the distance is ${dist.toFixed(1)}m, which breaks the ${maxDist}m adjacency constraint.`,
  },
  {
    question: (src, tgt, _d, maxDist) =>
      `How far is "${src}" from "${tgt}"? Is it within the ${maxDist}m threshold?`,
    positiveAnswer: (src, tgt, dist, maxDist) =>
      `"${src}" is ${dist.toFixed(1)}m from "${tgt}". This is within the ${maxDist}m threshold, so the adjacency holds.`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `"${src}" is ${dist.toFixed(1)}m from "${tgt}". This exceeds the ${maxDist}m threshold, so adjacency is violated.`,
  },
  {
    question: (src, tgt) =>
      `Analyze the spatial_adjacent constraint: is "${src}" properly positioned relative to "${tgt}"?`,
    positiveAnswer: (src, tgt, dist, maxDist) =>
      `"${src}" is properly positioned at ${dist.toFixed(1)}m from "${tgt}", satisfying the ${maxDist}m adjacency constraint.`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `"${src}" is improperly positioned at ${dist.toFixed(1)}m from "${tgt}". It should be within ${maxDist}m.`,
  },
  {
    question: (src, tgt) =>
      `Does the scene layout satisfy the proximity requirement between "${src}" and "${tgt}"?`,
    positiveAnswer: (src, tgt, dist) =>
      `Yes, the proximity requirement is satisfied. "${src}" and "${tgt}" are ${dist.toFixed(1)}m apart.`,
    negativeAnswer: (src, tgt, dist, maxDist) =>
      `No, the proximity requirement is not satisfied. "${src}" is ${dist.toFixed(1)}m from "${tgt}" (max: ${maxDist}m).`,
  },
  {
    question: (src, tgt, _d, maxDist) =>
      `Given the HoloScript scene below, would placing "${src}" at its position violate the ${maxDist}m adjacency with "${tgt}"?`,
    positiveAnswer: (_src, _tgt, dist, maxDist) =>
      `No violation. The position results in a ${dist.toFixed(1)}m distance, within the ${maxDist}m limit.`,
    negativeAnswer: (_src, _tgt, dist, maxDist) =>
      `Violation detected. The position results in a ${dist.toFixed(1)}m distance, exceeding the ${maxDist}m limit.`,
  },
];

/**
 * Instruction templates for spatial_contains relationship.
 */
const CONTAINS_QUESTION_TEMPLATES: Array<{
  question: (container: string, contained: string) => string;
  positiveAnswer: (container: string, contained: string) => string;
  negativeAnswer: (container: string, contained: string) => string;
}> = [
  {
    question: (container, contained) =>
      `Is "${contained}" inside "${container}"?`,
    positiveAnswer: (container, contained) =>
      `Yes, "${contained}" is fully contained within "${container}"'s bounds.`,
    negativeAnswer: (container, contained) =>
      `No, "${contained}" is outside "${container}"'s bounds.`,
  },
  {
    question: (container, contained) =>
      `Does "${container}" contain "${contained}" according to the spatial_contains constraint?`,
    positiveAnswer: (container, contained) =>
      `Yes, the spatial_contains constraint is satisfied. "${contained}" is within "${container}".`,
    negativeAnswer: (container, contained) =>
      `No, the spatial_contains constraint is violated. "${contained}" extends beyond "${container}"'s bounds.`,
  },
  {
    question: (container, contained) =>
      `Verify whether "${contained}" fits entirely within "${container}"'s bounding volume.`,
    positiveAnswer: (container, contained) =>
      `Verified: "${contained}" fits entirely within "${container}"'s bounding volume.`,
    negativeAnswer: (container, contained) =>
      `Verification failed: "${contained}" does not fit within "${container}"'s bounding volume.`,
  },
  {
    question: (container) =>
      `Which objects are inside "${container}" in this scene?`,
    positiveAnswer: (container, contained) =>
      `"${contained}" is inside "${container}", satisfying the containment constraint.`,
    negativeAnswer: (container, contained) =>
      `"${contained}" is NOT inside "${container}". It has moved outside the container bounds.`,
  },
  {
    question: (container, contained) =>
      `If "${container}" has bounds from its declared size, is "${contained}" at its current position within those bounds?`,
    positiveAnswer: (_container, contained) =>
      `Yes, "${contained}" at its current position falls within the container's declared bounds.`,
    negativeAnswer: (_container, contained) =>
      `No, "${contained}" at its current position falls outside the container's declared bounds.`,
  },
  {
    question: (container, contained) =>
      `Evaluate the containment relationship: does "${container}" enclose "${contained}"?`,
    positiveAnswer: (container, contained) =>
      `"${container}" successfully encloses "${contained}". The containment constraint is satisfied.`,
    negativeAnswer: (container, contained) =>
      `"${container}" does not enclose "${contained}". The containment constraint is violated.`,
  },
  {
    question: (container, contained) =>
      `In this HoloScript composition, check if "${contained}" remains within the zone defined by "${container}".`,
    positiveAnswer: (container, contained) =>
      `"${contained}" remains within the zone defined by "${container}".`,
    negativeAnswer: (container, contained) =>
      `"${contained}" has left the zone defined by "${container}".`,
  },
  {
    question: (container, contained) =>
      `Can "${contained}" exist at its current position without violating the containment constraint with "${container}"?`,
    positiveAnswer: (_container, contained) =>
      `Yes, "${contained}" can exist at its current position. It is within the container bounds.`,
    negativeAnswer: (_container, contained) =>
      `No, "${contained}" at its current position violates the containment constraint. It is outside the bounds.`,
  },
  {
    question: (container, contained) =>
      `Does the bounding box of "${container}" fully enclose the position of "${contained}"?`,
    positiveAnswer: (container, contained) =>
      `Yes, "${container}"'s bounding box fully encloses "${contained}"'s position.`,
    negativeAnswer: (container, contained) =>
      `No, "${container}"'s bounding box does not enclose "${contained}"'s position.`,
  },
  {
    question: (container, contained) =>
      `Analyze the spatial hierarchy: is "${contained}" a valid child within "${container}"'s spatial region?`,
    positiveAnswer: (container, contained) =>
      `"${contained}" is a valid child within "${container}"'s spatial region. Containment is satisfied.`,
    negativeAnswer: (container, contained) =>
      `"${contained}" is NOT a valid child within "${container}"'s spatial region. It extends outside the boundaries.`,
  },
  {
    question: (container, contained) =>
      `Given the margin constraint, is "${contained}" properly contained within "${container}"?`,
    positiveAnswer: (container, contained) =>
      `With the margin applied, "${contained}" is properly contained within "${container}".`,
    negativeAnswer: (container, contained) =>
      `With the margin applied, "${contained}" is NOT properly contained within "${container}". It is too close to or beyond the boundary.`,
  },
  {
    question: (container, contained) =>
      `Would moving "${contained}" to its declared position cause it to exit "${container}"?`,
    positiveAnswer: (container, contained) =>
      `No, "${contained}" at its declared position remains inside "${container}".`,
    negativeAnswer: (container, contained) =>
      `Yes, "${contained}" at its declared position would be outside "${container}".`,
  },
];

/**
 * Instruction templates for spatial_reachable relationship.
 */
const REACHABLE_QUESTION_TEMPLATES: Array<{
  question: (src: string, tgt: string, obstacles: string[]) => string;
  positiveAnswer: (src: string, tgt: string, pathLen: number) => string;
  negativeAnswer: (src: string, tgt: string, blocker: string) => string;
}> = [
  {
    question: (src, tgt) =>
      `Is there a clear path from "${src}" to "${tgt}"?`,
    positiveAnswer: (src, tgt, pathLen) =>
      `Yes, there is a clear path from "${src}" to "${tgt}" with a path length of ${pathLen.toFixed(1)}m.`,
    negativeAnswer: (src, tgt, blocker) =>
      `No, the path from "${src}" to "${tgt}" is blocked by "${blocker}".`,
  },
  {
    question: (src, tgt) =>
      `Can "${src}" reach "${tgt}" without obstruction?`,
    positiveAnswer: (src, tgt, pathLen) =>
      `Yes, "${src}" can reach "${tgt}" unobstructed. The path length is ${pathLen.toFixed(1)}m.`,
    negativeAnswer: (src, tgt, blocker) =>
      `No, "${src}" cannot reach "${tgt}". The obstacle "${blocker}" blocks the path.`,
  },
  {
    question: (src, tgt) =>
      `Does the spatial_reachable constraint between "${src}" and "${tgt}" pass?`,
    positiveAnswer: (src, tgt, pathLen) =>
      `The constraint passes. "${src}" can reach "${tgt}" via a ${pathLen.toFixed(1)}m path.`,
    negativeAnswer: (src, tgt, blocker) =>
      `The constraint fails. "${blocker}" obstructs the path between "${src}" and "${tgt}".`,
  },
  {
    question: (src, tgt, obstacles) =>
      `Given obstacles [${obstacles.map(o => `"${o}"`).join(', ')}], can "${src}" see "${tgt}"?`,
    positiveAnswer: (src, tgt) =>
      `Yes, despite the obstacles, "${src}" has line of sight to "${tgt}".`,
    negativeAnswer: (src, tgt, blocker) =>
      `No, "${blocker}" blocks the line of sight from "${src}" to "${tgt}".`,
  },
  {
    question: (src, tgt) =>
      `Evaluate whether "${src}" has an unobstructed path to "${tgt}" in this scene.`,
    positiveAnswer: (src, tgt, pathLen) =>
      `"${src}" has an unobstructed path to "${tgt}" measuring ${pathLen.toFixed(1)}m.`,
    negativeAnswer: (src, tgt, blocker) =>
      `"${src}" does NOT have an unobstructed path to "${tgt}". "${blocker}" is in the way.`,
  },
  {
    question: (src, tgt) =>
      `In this HoloScript scene, is "${tgt}" reachable from "${src}"?`,
    positiveAnswer: (_src, tgt, pathLen) =>
      `Yes, "${tgt}" is reachable with a direct path of ${pathLen.toFixed(1)}m.`,
    negativeAnswer: (_src, tgt, blocker) =>
      `No, "${tgt}" is not reachable. An obstacle ("${blocker}") blocks the direct path.`,
  },
  {
    question: (src, tgt) =>
      `Check the reachability constraint: can "${src}" navigate to "${tgt}"?`,
    positiveAnswer: (src, tgt, pathLen) =>
      `Reachability check passed: "${src}" can navigate to "${tgt}" (${pathLen.toFixed(1)}m path).`,
    negativeAnswer: (src, tgt, blocker) =>
      `Reachability check failed: "${src}" cannot navigate to "${tgt}" due to "${blocker}".`,
  },
  {
    question: (src, tgt) =>
      `Is the line of sight between "${src}" and "${tgt}" clear?`,
    positiveAnswer: (src, tgt) =>
      `Yes, line of sight between "${src}" and "${tgt}" is clear.`,
    negativeAnswer: (src, tgt, blocker) =>
      `No, line of sight is blocked. "${blocker}" obstructs the view from "${src}" to "${tgt}".`,
  },
  {
    question: (src, tgt, obstacles) =>
      `Considering ${obstacles.length} obstacle(s) in the scene, determine if "${src}" can reach "${tgt}".`,
    positiveAnswer: (src, tgt, pathLen) =>
      `Despite the obstacles, "${src}" can reach "${tgt}" via a ${pathLen.toFixed(1)}m path that avoids all obstructions.`,
    negativeAnswer: (src, tgt, blocker) =>
      `"${src}" cannot reach "${tgt}". The path is blocked by "${blocker}".`,
  },
  {
    question: (src, tgt) =>
      `Would placing a wall between "${src}" and "${tgt}" affect reachability? Analyze the current state.`,
    positiveAnswer: (src, tgt) =>
      `Currently, "${src}" and "${tgt}" are mutually reachable. Adding a wall could change this.`,
    negativeAnswer: (src, tgt, blocker) =>
      `Currently, "${src}" and "${tgt}" are NOT reachable due to "${blocker}". Adding more walls would not change this.`,
  },
  {
    question: (src, tgt) =>
      `Analyze path connectivity: does an unblocked route exist from "${src}" to "${tgt}"?`,
    positiveAnswer: (src, tgt, pathLen) =>
      `An unblocked route exists from "${src}" to "${tgt}" with a total distance of ${pathLen.toFixed(1)}m.`,
    negativeAnswer: (src, tgt, blocker) =>
      `No unblocked route exists from "${src}" to "${tgt}". "${blocker}" creates a barrier.`,
  },
  {
    question: (src, tgt) =>
      `For NPC pathfinding, can "${src}" walk to "${tgt}" in a straight line?`,
    positiveAnswer: (src, tgt, pathLen) =>
      `Yes, "${src}" can walk directly to "${tgt}" in a straight line (${pathLen.toFixed(1)}m).`,
    negativeAnswer: (src, tgt, blocker) =>
      `No, "${src}" cannot walk straight to "${tgt}". "${blocker}" is obstructing the direct path.`,
  },
];

// =============================================================================
// OBJECT NAME POOLS
// =============================================================================

const OBJECT_NAMES = [
  'Table', 'Chair', 'Lamp', 'Bookshelf', 'Desk', 'Sofa', 'Cabinet', 'Mirror',
  'Plant', 'Clock', 'Vase', 'Rug', 'Painting', 'Shelf', 'Stool', 'Bench',
  'Chest', 'Barrel', 'Crate', 'Box', 'Pillar', 'Statue', 'Crystal',
  'Orb', 'Pedestal', 'Platform', 'Beacon', 'Terminal', 'Console', 'Panel',
];

const ZONE_NAMES = [
  'Room', 'Hall', 'Chamber', 'Arena', 'Gallery', 'Vault',
  'Atrium', 'Courtyard', 'Alcove', 'Corridor', 'Laboratory', 'Workshop',
];

const OBSTACLE_NAMES = [
  'Wall', 'Barrier', 'Fence', 'Pillar', 'Column', 'Boulder',
  'Shield', 'Gate', 'Blockade', 'Partition', 'Divider', 'Screen',
];

const NPC_NAMES = [
  'Guard', 'Merchant', 'Explorer', 'Scout', 'Villager', 'Artisan',
  'Drone', 'Robot', 'Companion', 'Agent', 'Sentinel', 'Worker',
];

const GEOMETRY_TYPES = ['cube', 'sphere', 'cylinder', 'torus', 'cone', 'prism'];

const COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff',
  '#ff8800', '#8800ff', '#00ff88', '#ff0088', '#888888', '#ffffff',
];

// =============================================================================
// HOLOSCRIPT GENERATION HELPERS
// =============================================================================

function generateObjectBlock(obj: SceneObject, indent: string = '  '): string {
  const lines: string[] = [];
  lines.push(`${indent}object "${obj.id}" {`);
  if (obj.geometry) {
    lines.push(`${indent}  geometry: "${obj.geometry}"`);
  }
  lines.push(`${indent}  position: [${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)}]`);
  if (obj.scale.x !== 1 || obj.scale.y !== 1 || obj.scale.z !== 1) {
    lines.push(`${indent}  scale: [${obj.scale.x.toFixed(1)}, ${obj.scale.y.toFixed(1)}, ${obj.scale.z.toFixed(1)}]`);
  }
  if (obj.color) {
    lines.push(`${indent}  color: "${obj.color}"`);
  }
  lines.push(`${indent}}`);
  return lines.join('\n');
}

function generateZoneBlock(obj: SceneObject, indent: string = '  '): string {
  const lines: string[] = [];
  lines.push(`${indent}zone "${obj.id}" {`);
  lines.push(`${indent}  shape: "box"`);
  const sx = obj.scale.x;
  const sy = obj.scale.y;
  const sz = obj.scale.z;
  lines.push(`${indent}  size: [${sx.toFixed(1)}, ${sy.toFixed(1)}, ${sz.toFixed(1)}]`);
  lines.push(`${indent}  position: [${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)}]`);
  lines.push(`${indent}}`);
  return lines.join('\n');
}

function generateAdjacentTrait(targetId: string, maxDist: number, axis?: string): string {
  const parts = [`target: "${targetId}"`, `maxDistance: ${maxDist.toFixed(1)}m`];
  if (axis && axis !== 'xyz') {
    parts.push(`axis: "${axis}"`);
  }
  return `@spatial_adjacent(${parts.join(', ')})`;
}

function generateContainsTrait(targetId: string, margin?: number, strict?: boolean): string {
  const parts = [`target: "${targetId}"`];
  if (margin !== undefined && margin > 0) {
    parts.push(`margin: ${margin.toFixed(1)}m`);
  }
  if (strict) {
    parts.push('strict: true');
  }
  return `@spatial_contains(${parts.join(', ')})`;
}

function generateReachableTrait(targetId: string, maxPathLength?: number, obstacles?: string[], algorithm?: string): string {
  const parts = [`target: "${targetId}"`];
  if (maxPathLength !== undefined) {
    parts.push(`maxPathLength: ${maxPathLength.toFixed(0)}m`);
  }
  if (obstacles && obstacles.length > 0) {
    parts.push(`obstacles: [${obstacles.map(o => `"${o}"`).join(', ')}]`);
  }
  if (algorithm) {
    parts.push(`algorithm: "${algorithm}"`);
  }
  return `@spatial_reachable(${parts.join(', ')})`;
}

function computeDistance(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function isPointInBox(
  point: { x: number; y: number; z: number },
  bounds: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } },
  margin: number = 0
): boolean {
  return (
    point.x >= bounds.min.x + margin &&
    point.x <= bounds.max.x - margin &&
    point.y >= bounds.min.y + margin &&
    point.y <= bounds.max.y - margin &&
    point.z >= bounds.min.z + margin &&
    point.z <= bounds.max.z - margin
  );
}

/**
 * Simple line-segment vs AABB intersection test.
 * Returns true if the line from `a` to `b` intersects the box.
 */
function lineIntersectsBox(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }
): boolean {
  const dir = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
  if (len === 0) return false;

  let tmin = 0;
  let tmax = 1;

  const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
  for (const axis of axes) {
    const d = dir[axis];
    const o = a[axis];
    const bmin = box.min[axis];
    const bmax = box.max[axis];

    if (Math.abs(d) < 1e-10) {
      if (o < bmin || o > bmax) return false;
    } else {
      let t1 = (bmin - o) / d;
      let t2 = (bmax - o) / d;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
      }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }

  return true;
}

// =============================================================================
// SPATIAL TRAINING DATA GENERATOR
// =============================================================================

/**
 * Generates labeled spatial reasoning examples from HoloScript compositions.
 *
 * @example
 * ```typescript
 * const generator = new SpatialTrainingDataGenerator({ seed: 42 });
 * const examples = generator.generate();
 * const jsonl = generator.exportJSONL(examples);
 * ```
 */
export class SpatialTrainingDataGenerator {
  private readonly config: Required<SpatialGeneratorConfig>;
  private rng: SeededRandom;
  private exampleCounter: number = 0;

  constructor(config: SpatialGeneratorConfig = {}) {
    this.config = {
      examplesPerCategory: config.examplesPerCategory ?? 10,
      relationshipTypes: config.relationshipTypes ?? [
        'spatial_adjacent',
        'spatial_contains',
        'spatial_reachable',
      ],
      difficultyLevels: config.difficultyLevels ?? ['basic', 'intermediate', 'advanced'],
      positiveRatio: config.positiveRatio ?? 0.5,
      seed: config.seed ?? Date.now(),
      includeContext: config.includeContext ?? true,
    };
    this.rng = new SeededRandom(this.config.seed);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Generate all spatial training examples based on configuration.
   */
  generate(): SpatialTrainingExample[] {
    const examples: SpatialTrainingExample[] = [];
    this.exampleCounter = 0;

    for (const relType of this.config.relationshipTypes) {
      for (const difficulty of this.config.difficultyLevels) {
        const count = this.config.examplesPerCategory;

        for (let i = 0; i < count; i++) {
          const isPositive = this.rng.next() < this.config.positiveRatio;
          const scene = this.generateScene(relType, difficulty, isPositive);
          const example = this.generateExample(scene, relType, isPositive, difficulty);
          examples.push(example);
        }
      }
    }

    return examples;
  }

  /**
   * Generate examples for a specific relationship type.
   */
  generateForRelationship(relType: SpatialRelationshipType): SpatialTrainingExample[] {
    const examples: SpatialTrainingExample[] = [];

    for (const difficulty of this.config.difficultyLevels) {
      const count = this.config.examplesPerCategory;

      for (let i = 0; i < count; i++) {
        const isPositive = this.rng.next() < this.config.positiveRatio;
        const scene = this.generateScene(relType, difficulty, isPositive);
        const example = this.generateExample(scene, relType, isPositive, difficulty);
        examples.push(example);
      }
    }

    return examples;
  }

  /**
   * Generate examples for a specific difficulty level.
   */
  generateForDifficulty(difficulty: SpatialDifficulty): SpatialTrainingExample[] {
    const examples: SpatialTrainingExample[] = [];

    for (const relType of this.config.relationshipTypes) {
      const count = this.config.examplesPerCategory;

      for (let i = 0; i < count; i++) {
        const isPositive = this.rng.next() < this.config.positiveRatio;
        const scene = this.generateScene(relType, difficulty, isPositive);
        const example = this.generateExample(scene, relType, isPositive, difficulty);
        examples.push(example);
      }
    }

    return examples;
  }

  /**
   * Export examples as JSONL string (one JSON object per line).
   */
  exportJSONL(examples: SpatialTrainingExample[]): string {
    return examples
      .map((ex) => {
        const entry: SpatialTrainingJSONLEntry = {
          instruction: this.config.includeContext
            ? `${ex.instruction}\n\nHoloScript Scene:\n\`\`\`holoscript\n${ex.context}\n\`\`\``
            : ex.instruction,
          response: ex.response,
          metadata: {
            id: ex.id,
            relationship_type: ex.relationshipType,
            is_positive: ex.isPositive,
            difficulty: ex.difficulty,
            tags: ex.tags,
          },
        };
        return JSON.stringify(entry);
      })
      .join('\n');
  }

  /**
   * Export examples as JSON array string.
   */
  exportJSON(examples: SpatialTrainingExample[]): string {
    return JSON.stringify(examples, null, 2);
  }

  /**
   * Get statistics about generated examples.
   */
  getStats(examples: SpatialTrainingExample[]): SpatialGeneratorStats {
    const byRelationship: Record<SpatialRelationshipType, number> = {
      spatial_adjacent: 0,
      spatial_contains: 0,
      spatial_reachable: 0,
    };
    const byDifficulty: Record<SpatialDifficulty, number> = {
      basic: 0,
      intermediate: 0,
      advanced: 0,
    };
    let positiveCount = 0;
    let negativeCount = 0;
    const templateIds = new Set<string>();

    for (const ex of examples) {
      byRelationship[ex.relationshipType]++;
      byDifficulty[ex.difficulty]++;
      if (ex.isPositive) positiveCount++;
      else negativeCount++;
      // Extract template hint from tags
      const tplTag = ex.tags.find((t) => t.startsWith('template:'));
      if (tplTag) templateIds.add(tplTag);
    }

    return {
      totalExamples: examples.length,
      byRelationship,
      byDifficulty,
      positiveCount,
      negativeCount,
      uniqueTemplatesUsed: templateIds.size,
    };
  }

  /**
   * Reset the generator with a new seed.
   */
  reseed(seed: number): void {
    this.rng = new SeededRandom(seed);
    this.exampleCounter = 0;
  }

  // ---------------------------------------------------------------------------
  // Scene Generation
  // ---------------------------------------------------------------------------

  /**
   * Generate a spatial scene for the given relationship type and difficulty.
   */
  generateScene(
    relType: SpatialRelationshipType,
    difficulty: SpatialDifficulty,
    isPositive: boolean
  ): SpatialScene {
    switch (relType) {
      case 'spatial_adjacent':
        return this.generateAdjacentScene(difficulty, isPositive);
      case 'spatial_contains':
        return this.generateContainsScene(difficulty, isPositive);
      case 'spatial_reachable':
        return this.generateReachableScene(difficulty, isPositive);
    }
  }

  // ---------------------------------------------------------------------------
  // Adjacent Scene Generation
  // ---------------------------------------------------------------------------

  private generateAdjacentScene(difficulty: SpatialDifficulty, isPositive: boolean): SpatialScene {
    const objectCount = this.getObjectCount(difficulty);
    const maxDistance = this.rng.float(1.0, 5.0);
    const objects: SceneObject[] = [];
    const relationships: SpatialRelationship[] = [];

    // Generate source object
    const srcName = this.rng.pick(OBJECT_NAMES);
    const srcPos = this.randomPosition(difficulty);
    const srcObj: SceneObject = {
      id: srcName,
      type: 'object',
      position: srcPos,
      scale: this.randomScale(),
      geometry: this.rng.pick(GEOMETRY_TYPES),
      color: this.rng.pick(COLORS),
    };
    objects.push(srcObj);

    // Generate target object - position depends on whether positive or negative
    const tgtName = this.pickUniqueName(OBJECT_NAMES, [srcName]);
    let tgtPos;
    if (isPositive) {
      // Place within maxDistance
      const angle = this.rng.float(0, Math.PI * 2);
      const elevation = this.rng.float(-0.5, 0.5);
      const dist = this.rng.float(0.5, maxDistance * 0.9);
      tgtPos = {
        x: srcPos.x + Math.cos(angle) * dist,
        y: srcPos.y + elevation,
        z: srcPos.z + Math.sin(angle) * dist,
      };
    } else {
      // Place beyond maxDistance
      const angle = this.rng.float(0, Math.PI * 2);
      const dist = this.rng.float(maxDistance * 1.5, maxDistance * 3.0);
      tgtPos = {
        x: srcPos.x + Math.cos(angle) * dist,
        y: srcPos.y + this.rng.float(-1, 1),
        z: srcPos.z + Math.sin(angle) * dist,
      };
    }

    const tgtObj: SceneObject = {
      id: tgtName,
      type: 'object',
      position: tgtPos,
      scale: this.randomScale(),
      geometry: this.rng.pick(GEOMETRY_TYPES),
      color: this.rng.pick(COLORS),
    };
    objects.push(tgtObj);

    const actualDist = computeDistance(srcPos, tgtPos);

    relationships.push({
      type: 'spatial_adjacent',
      sourceId: srcName,
      targetId: tgtName,
      satisfied: actualDist <= maxDistance,
      params: { maxDistance },
    });

    // Add extra objects for intermediate/advanced
    const usedNames = [srcName, tgtName];
    for (let i = 2; i < objectCount; i++) {
      const name = this.pickUniqueName(OBJECT_NAMES, usedNames);
      usedNames.push(name);
      objects.push({
        id: name,
        type: 'object',
        position: this.randomPosition(difficulty),
        scale: this.randomScale(),
        geometry: this.rng.pick(GEOMETRY_TYPES),
        color: this.rng.pick(COLORS),
      });
    }

    // Generate HoloScript source
    const holoScript = this.buildAdjacentHoloScript(objects, srcName, tgtName, maxDistance);

    return {
      name: `AdjacentScene_${this.exampleCounter}`,
      objects,
      relationships,
      difficulty,
      holoScriptSource: holoScript,
    };
  }

  private buildAdjacentHoloScript(
    objects: SceneObject[],
    srcName: string,
    tgtName: string,
    maxDistance: number
  ): string {
    const lines: string[] = [];
    lines.push(`composition "SpatialScene" {`);

    for (const obj of objects) {
      if (obj.id === srcName) {
        // Source object gets the adjacent trait
        lines.push(`  object "${obj.id}" {`);
        if (obj.geometry) lines.push(`    geometry: "${obj.geometry}"`);
        lines.push(`    position: [${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)}]`);
        if (obj.color) lines.push(`    color: "${obj.color}"`);
        lines.push(`    ${generateAdjacentTrait(tgtName, maxDistance)}`);
        lines.push('  }');
      } else {
        lines.push(generateObjectBlock(obj));
      }
      lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Contains Scene Generation
  // ---------------------------------------------------------------------------

  private generateContainsScene(difficulty: SpatialDifficulty, isPositive: boolean): SpatialScene {
    const objects: SceneObject[] = [];
    const relationships: SpatialRelationship[] = [];

    // Generate container (zone)
    const containerName = this.rng.pick(ZONE_NAMES);
    const containerSize = {
      x: this.rng.float(4, 12),
      y: this.rng.float(3, 8),
      z: this.rng.float(4, 12),
    };
    const containerPos = this.randomPosition(difficulty);
    const margin = this.rng.float(0, 0.5);

    const containerBounds = {
      min: {
        x: containerPos.x - containerSize.x / 2,
        y: containerPos.y - containerSize.y / 2,
        z: containerPos.z - containerSize.z / 2,
      },
      max: {
        x: containerPos.x + containerSize.x / 2,
        y: containerPos.y + containerSize.y / 2,
        z: containerPos.z + containerSize.z / 2,
      },
    };

    const containerObj: SceneObject = {
      id: containerName,
      type: 'zone',
      position: containerPos,
      scale: containerSize,
      bounds: containerBounds,
    };
    objects.push(containerObj);

    // Generate contained object(s)
    const objectCount = this.getObjectCount(difficulty);
    const containedName = this.rng.pick(OBJECT_NAMES);
    let containedPos;

    if (isPositive) {
      // Place inside container bounds (with margin)
      containedPos = {
        x: this.rng.float(containerBounds.min.x + margin + 0.5, containerBounds.max.x - margin - 0.5),
        y: this.rng.float(containerBounds.min.y + margin + 0.5, containerBounds.max.y - margin - 0.5),
        z: this.rng.float(containerBounds.min.z + margin + 0.5, containerBounds.max.z - margin - 0.5),
      };
    } else {
      // Place outside container bounds
      const side = this.rng.int(0, 5);
      containedPos = { ...containerPos };
      switch (side) {
        case 0: containedPos.x = containerBounds.max.x + this.rng.float(1, 5); break;
        case 1: containedPos.x = containerBounds.min.x - this.rng.float(1, 5); break;
        case 2: containedPos.y = containerBounds.max.y + this.rng.float(1, 5); break;
        case 3: containedPos.y = containerBounds.min.y - this.rng.float(1, 5); break;
        case 4: containedPos.z = containerBounds.max.z + this.rng.float(1, 5); break;
        case 5: containedPos.z = containerBounds.min.z - this.rng.float(1, 5); break;
      }
    }

    const containedObj: SceneObject = {
      id: containedName,
      type: 'object',
      position: containedPos,
      scale: this.randomScale(),
      geometry: this.rng.pick(GEOMETRY_TYPES),
      color: this.rng.pick(COLORS),
    };
    objects.push(containedObj);

    const actuallyContained = isPointInBox(containedPos, containerBounds, margin);

    relationships.push({
      type: 'spatial_contains',
      sourceId: containerName,
      targetId: containedName,
      satisfied: actuallyContained,
      params: { margin: margin > 0 ? margin : undefined },
    });

    // For advanced: add nested containment
    const usedNames = [containerName, containedName];
    if (difficulty === 'advanced') {
      // Add inner container
      const innerContainerName = this.pickUniqueName(ZONE_NAMES, usedNames);
      usedNames.push(innerContainerName);
      const innerSize = {
        x: containerSize.x * 0.4,
        y: containerSize.y * 0.4,
        z: containerSize.z * 0.4,
      };
      const innerObj: SceneObject = {
        id: innerContainerName,
        type: 'zone',
        position: { ...containerPos },
        scale: innerSize,
        bounds: {
          min: {
            x: containerPos.x - innerSize.x / 2,
            y: containerPos.y - innerSize.y / 2,
            z: containerPos.z - innerSize.z / 2,
          },
          max: {
            x: containerPos.x + innerSize.x / 2,
            y: containerPos.y + innerSize.y / 2,
            z: containerPos.z + innerSize.z / 2,
          },
        },
      };
      objects.push(innerObj);
    }

    // Add extra objects
    for (let i = objects.length; i < objectCount; i++) {
      const name = this.pickUniqueName(OBJECT_NAMES, usedNames);
      usedNames.push(name);
      objects.push({
        id: name,
        type: 'object',
        position: this.randomPosition(difficulty),
        scale: this.randomScale(),
        geometry: this.rng.pick(GEOMETRY_TYPES),
        color: this.rng.pick(COLORS),
      });
    }

    const holoScript = this.buildContainsHoloScript(objects, containerName, containedName, margin);

    return {
      name: `ContainsScene_${this.exampleCounter}`,
      objects,
      relationships,
      difficulty,
      holoScriptSource: holoScript,
    };
  }

  private buildContainsHoloScript(
    objects: SceneObject[],
    containerName: string,
    containedName: string,
    margin: number
  ): string {
    const lines: string[] = [];
    lines.push(`composition "SpatialScene" {`);

    for (const obj of objects) {
      if (obj.type === 'zone') {
        if (obj.id === containerName) {
          lines.push(`  zone "${obj.id}" {`);
          lines.push(`    shape: "box"`);
          lines.push(`    size: [${obj.scale.x.toFixed(1)}, ${obj.scale.y.toFixed(1)}, ${obj.scale.z.toFixed(1)}]`);
          lines.push(`    position: [${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)}]`);
          lines.push(`    ${generateContainsTrait(containedName, margin > 0 ? margin : undefined)}`);
          lines.push('  }');
        } else {
          lines.push(generateZoneBlock(obj));
        }
      } else {
        lines.push(generateObjectBlock(obj));
      }
      lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Reachable Scene Generation
  // ---------------------------------------------------------------------------

  private generateReachableScene(difficulty: SpatialDifficulty, isPositive: boolean): SpatialScene {
    const objectCount = this.getObjectCount(difficulty);
    const objects: SceneObject[] = [];
    const relationships: SpatialRelationship[] = [];

    // Generate source (NPC/agent)
    const srcName = this.rng.pick(NPC_NAMES);
    const srcPos = this.randomPosition(difficulty);
    objects.push({
      id: srcName,
      type: 'npc',
      position: srcPos,
      scale: { x: 1, y: 1, z: 1 },
      geometry: 'sphere',
      color: this.rng.pick(COLORS),
    });

    // Generate target
    const tgtName = this.pickUniqueName([...OBJECT_NAMES, ...NPC_NAMES], [srcName]);
    const tgtAngle = this.rng.float(0, Math.PI * 2);
    const tgtDist = this.rng.float(5, 20);
    const tgtPos = {
      x: srcPos.x + Math.cos(tgtAngle) * tgtDist,
      y: srcPos.y + this.rng.float(-1, 1),
      z: srcPos.z + Math.sin(tgtAngle) * tgtDist,
    };
    objects.push({
      id: tgtName,
      type: 'object',
      position: tgtPos,
      scale: this.randomScale(),
      geometry: this.rng.pick(GEOMETRY_TYPES),
      color: this.rng.pick(COLORS),
    });

    // Generate obstacles
    const obstacleCount = difficulty === 'basic' ? 0 : difficulty === 'intermediate' ? this.rng.int(1, 2) : this.rng.int(2, 4);
    const obstacleNames: string[] = [];
    const usedNames = [srcName, tgtName];
    let blockingObstacle: string | null = null;

    for (let i = 0; i < obstacleCount; i++) {
      const obsName = this.pickUniqueName(OBSTACLE_NAMES, usedNames);
      usedNames.push(obsName);
      obstacleNames.push(obsName);

      const obsScale = {
        x: this.rng.float(1.5, 4),
        y: this.rng.float(2, 5),
        z: this.rng.float(1.5, 4),
      };

      let obsPos;
      if (!isPositive && i === 0) {
        // Place first obstacle directly in the path (for negative examples)
        const t = this.rng.float(0.3, 0.7);
        obsPos = {
          x: srcPos.x + (tgtPos.x - srcPos.x) * t,
          y: srcPos.y + (tgtPos.y - srcPos.y) * t,
          z: srcPos.z + (tgtPos.z - srcPos.z) * t,
        };
        blockingObstacle = obsName;
      } else {
        // Place off to the side (doesn't block)
        const offset = this.rng.float(3, 8);
        const side = this.rng.next() > 0.5 ? 1 : -1;
        const midpoint = {
          x: (srcPos.x + tgtPos.x) / 2,
          y: (srcPos.y + tgtPos.y) / 2,
          z: (srcPos.z + tgtPos.z) / 2,
        };
        // Perpendicular offset
        const perpX = -(tgtPos.z - srcPos.z);
        const perpZ = tgtPos.x - srcPos.x;
        const perpLen = Math.sqrt(perpX * perpX + perpZ * perpZ);
        if (perpLen > 0) {
          obsPos = {
            x: midpoint.x + (perpX / perpLen) * offset * side,
            y: midpoint.y,
            z: midpoint.z + (perpZ / perpLen) * offset * side,
          };
        } else {
          obsPos = {
            x: midpoint.x + offset * side,
            y: midpoint.y,
            z: midpoint.z,
          };
        }
      }

      const obsBounds = {
        min: {
          x: obsPos.x - obsScale.x / 2,
          y: obsPos.y - obsScale.y / 2,
          z: obsPos.z - obsScale.z / 2,
        },
        max: {
          x: obsPos.x + obsScale.x / 2,
          y: obsPos.y + obsScale.y / 2,
          z: obsPos.z + obsScale.z / 2,
        },
      };

      objects.push({
        id: obsName,
        type: 'obstacle',
        position: obsPos,
        scale: obsScale,
        bounds: obsBounds,
        isObstacle: true,
        geometry: 'cube',
        color: '#444444',
      });
    }

    // Check actual reachability
    let actuallyReachable = true;
    if (obstacleNames.length > 0) {
      for (const obj of objects) {
        if (obj.isObstacle && obj.bounds) {
          if (lineIntersectsBox(srcPos, tgtPos, obj.bounds)) {
            actuallyReachable = false;
            if (!blockingObstacle) blockingObstacle = obj.id;
            break;
          }
        }
      }
    }

    const maxPathLength = this.rng.float(tgtDist * 1.2, tgtDist * 2.0);

    relationships.push({
      type: 'spatial_reachable',
      sourceId: srcName,
      targetId: tgtName,
      satisfied: actuallyReachable,
      params: {
        maxPathLength,
        obstacleTypes: obstacleNames.length > 0 ? ['obstacle'] : undefined,
        algorithm: 'line_of_sight',
      },
    });

    // Add extra objects for complexity
    for (let i = objects.length; i < objectCount; i++) {
      const name = this.pickUniqueName(OBJECT_NAMES, usedNames);
      usedNames.push(name);
      objects.push({
        id: name,
        type: 'object',
        position: this.randomPosition(difficulty),
        scale: this.randomScale(),
        geometry: this.rng.pick(GEOMETRY_TYPES),
        color: this.rng.pick(COLORS),
      });
    }

    const holoScript = this.buildReachableHoloScript(
      objects,
      srcName,
      tgtName,
      maxPathLength,
      obstacleNames
    );

    return {
      name: `ReachableScene_${this.exampleCounter}`,
      objects,
      relationships,
      difficulty,
      holoScriptSource: holoScript,
    };
  }

  private buildReachableHoloScript(
    objects: SceneObject[],
    srcName: string,
    tgtName: string,
    maxPathLength: number,
    obstacleNames: string[]
  ): string {
    const lines: string[] = [];
    lines.push(`composition "SpatialScene" {`);

    for (const obj of objects) {
      if (obj.id === srcName) {
        lines.push(`  object "${obj.id}" {`);
        if (obj.geometry) lines.push(`    geometry: "${obj.geometry}"`);
        lines.push(`    position: [${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)}]`);
        if (obj.color) lines.push(`    color: "${obj.color}"`);
        lines.push(`    ${generateReachableTrait(tgtName, maxPathLength, obstacleNames.length > 0 ? ['obstacle'] : undefined, 'line_of_sight')}`);
        lines.push('  }');
      } else if (obj.isObstacle) {
        lines.push(`  object "${obj.id}" {`);
        lines.push(`    geometry: "cube"`);
        lines.push(`    position: [${obj.position.x.toFixed(1)}, ${obj.position.y.toFixed(1)}, ${obj.position.z.toFixed(1)}]`);
        lines.push(`    scale: [${obj.scale.x.toFixed(1)}, ${obj.scale.y.toFixed(1)}, ${obj.scale.z.toFixed(1)}]`);
        lines.push('    @static');
        lines.push('    @collidable');
        lines.push('  }');
      } else {
        lines.push(generateObjectBlock(obj));
      }
      lines.push('');
    }

    lines.push('}');
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Example Generation (instruction-response pairs)
  // ---------------------------------------------------------------------------

  private generateExample(
    scene: SpatialScene,
    relType: SpatialRelationshipType,
    isPositive: boolean,
    difficulty: SpatialDifficulty
  ): SpatialTrainingExample {
    this.exampleCounter++;
    const rel = scene.relationships[0];

    let instruction: string;
    let response: string;
    let templateIndex: number;

    switch (relType) {
      case 'spatial_adjacent': {
        templateIndex = this.rng.int(0, ADJACENT_QUESTION_TEMPLATES.length - 1);
        const template = ADJACENT_QUESTION_TEMPLATES[templateIndex];
        const dist = computeDistance(
          scene.objects.find((o) => o.id === rel.sourceId)!.position,
          scene.objects.find((o) => o.id === rel.targetId)!.position
        );
        instruction = template.question(rel.sourceId, rel.targetId, dist, rel.params.maxDistance!);
        response = isPositive
          ? template.positiveAnswer(rel.sourceId, rel.targetId, dist, rel.params.maxDistance!)
          : template.negativeAnswer(rel.sourceId, rel.targetId, dist, rel.params.maxDistance!);
        break;
      }

      case 'spatial_contains': {
        templateIndex = this.rng.int(0, CONTAINS_QUESTION_TEMPLATES.length - 1);
        const template = CONTAINS_QUESTION_TEMPLATES[templateIndex];
        instruction = template.question(rel.sourceId, rel.targetId);
        response = isPositive
          ? template.positiveAnswer(rel.sourceId, rel.targetId)
          : template.negativeAnswer(rel.sourceId, rel.targetId);
        break;
      }

      case 'spatial_reachable': {
        templateIndex = this.rng.int(0, REACHABLE_QUESTION_TEMPLATES.length - 1);
        const template = REACHABLE_QUESTION_TEMPLATES[templateIndex];
        const obstacles = scene.objects
          .filter((o) => o.isObstacle)
          .map((o) => o.id);
        const pathLen = computeDistance(
          scene.objects.find((o) => o.id === rel.sourceId)!.position,
          scene.objects.find((o) => o.id === rel.targetId)!.position
        );
        const blocker = scene.objects.find((o) => o.isObstacle)?.id ?? 'unknown';

        instruction = template.question(rel.sourceId, rel.targetId, obstacles);
        response = isPositive
          ? template.positiveAnswer(rel.sourceId, rel.targetId, pathLen)
          : template.negativeAnswer(rel.sourceId, rel.targetId, blocker);
        break;
      }
    }

    return {
      id: `spatial-${relType.replace('spatial_', '')}-${difficulty}-${this.exampleCounter}`,
      instruction,
      response,
      context: scene.holoScriptSource,
      relationshipType: relType,
      isPositive,
      difficulty,
      tags: [
        relType,
        difficulty,
        isPositive ? 'positive' : 'negative',
        `template:${relType}-${templateIndex}`,
      ],
    };
  }

  // ---------------------------------------------------------------------------
  // Utility Methods
  // ---------------------------------------------------------------------------

  private getObjectCount(difficulty: SpatialDifficulty): number {
    switch (difficulty) {
      case 'basic':
        return 2;
      case 'intermediate':
        return this.rng.int(3, 5);
      case 'advanced':
        return this.rng.int(6, 9);
    }
  }

  private randomPosition(difficulty: SpatialDifficulty): { x: number; y: number; z: number } {
    const range = difficulty === 'basic' ? 5 : difficulty === 'intermediate' ? 10 : 20;
    return {
      x: this.rng.float(-range, range),
      y: this.rng.float(0, range / 2),
      z: this.rng.float(-range, range),
    };
  }

  private randomScale(): { x: number; y: number; z: number } {
    const uniform = this.rng.next() > 0.5;
    if (uniform) {
      const s = this.rng.float(0.3, 2.5);
      return { x: s, y: s, z: s };
    }
    return {
      x: this.rng.float(0.3, 3.0),
      y: this.rng.float(0.3, 3.0),
      z: this.rng.float(0.3, 3.0),
    };
  }

  private pickUniqueName(pool: string[], used: string[]): string {
    const available = pool.filter((n) => !used.includes(n));
    if (available.length === 0) {
      // Fallback: append a number
      return `${this.rng.pick(pool)}_${this.rng.int(100, 999)}`;
    }
    return this.rng.pick(available);
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create a new SpatialTrainingDataGenerator with the given configuration.
 */
export function createSpatialTrainingDataGenerator(
  config?: SpatialGeneratorConfig
): SpatialTrainingDataGenerator {
  return new SpatialTrainingDataGenerator(config);
}
