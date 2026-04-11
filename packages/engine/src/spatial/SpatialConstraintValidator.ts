/**
 * Spatial Constraint Validator
 *
 * Performs compile-time verification of spatial constraints declared in
 * HoloScript source. Analyzes spatial declarations (positions, bounds,
 * hierarchy) to detect constraint violations before runtime.
 *
 * Diagnostic codes:
 *   HSP030 — spatial_adjacent violation
 *   HSP031 — spatial_contains violation
 *   HSP032 — spatial_reachable violation
 *   HSP033 — spatial constraint target not found
 *   HSP034 — spatial constraint circular reference
 *   HSP035 — spatial constraint incompatible configuration
 *   HSP036 — spatial_temporal_adjacent violation
 *   HSP037 — spatial_temporal_reachable violation
 *   HSP038 — spatial_trajectory violation
 *
 * @module spatial/SpatialConstraintValidator
 */

import {
  distance,
  isPointInBox,
  _isPointInSphere,
  _boxesOverlap,
  _getBoxCenter,
  normalize,
  subtract,
  _dot,
} from './SpatialTypes';

import type { Vector3, BoundingBox, BoundingSphere } from './SpatialTypes';

import type {
  SpatialConstraint,
  SpatialConstraintKind,
  SpatialConstraintCheckResult,
  SpatialConstraintDiagnostic,
  SpatialDiagnosticSeverity,
  SpatialDeclaration,
  SpatialAdjacentConstraint,
  SpatialContainsConstraint,
  SpatialReachableConstraint,
  SpatialTemporalAdjacentConstraint,
  SpatialTemporalReachableConstraint,
  SpatialTrajectoryConstraint,
  SpatialAxis,
} from './SpatialConstraintTypes';

// =============================================================================
// VALIDATOR
// =============================================================================

/**
 * Compile-time spatial constraint validator.
 *
 * Given a set of spatial declarations (extracted from parsed HoloScript AST),
 * validates all declared spatial constraints and reports diagnostics.
 *
 * @example
 * ```typescript
 * const validator = new SpatialConstraintValidator();
 * const result = validator.validate(declarations);
 * if (!result.valid) {
 *   for (const diag of result.diagnostics) {
 *     console.error(`[${diag.code}] ${diag.message}`);
 *   }
 * }
 * ```
 */
export class SpatialConstraintValidator {
  private declarations: Map<string, SpatialDeclaration> = new Map();
  private diagnostics: SpatialConstraintDiagnostic[] = [];
  private constraintMap: Map<string, SpatialConstraint[]> = new Map();

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Validate all spatial constraints across a set of declarations.
   */
  validate(declarations: SpatialDeclaration[]): SpatialConstraintCheckResult {
    this.reset();

    // Index declarations by entity ID
    for (const decl of declarations) {
      this.declarations.set(decl.entityId, decl);
      this.constraintMap.set(decl.entityId, [...decl.constraints]);
    }

    // Pass 1: Resolve references — check that all target entities exist
    this.resolveReferences();

    // Pass 2: Detect circular constraint references
    this.detectCircularReferences();

    // Pass 3: Validate each constraint category
    for (const decl of declarations) {
      for (const constraint of decl.constraints) {
        switch (constraint.kind) {
          case 'spatial_adjacent':
            this.validateAdjacent(decl, constraint);
            break;
          case 'spatial_contains':
            this.validateContains(decl, constraint);
            break;
          case 'spatial_reachable':
            this.validateReachable(decl, constraint);
            break;
          case 'spatial_temporal_adjacent':
            this.validateTemporalAdjacent(decl, constraint);
            break;
          case 'spatial_temporal_reachable':
            this.validateTemporalReachable(decl, constraint);
            break;
          case 'spatial_trajectory':
            this.validateTrajectory(decl, constraint);
            break;
        }
      }
    }

    // Pass 4: Cross-constraint consistency checks
    this.validateCrossConstraintConsistency();

    // Build result
    const errors = this.diagnostics.filter((d) => d.severity === 'error');
    const warnings = this.diagnostics.filter((d) => d.severity === 'warning');

    const allConstraints = declarations.flatMap((d) => d.constraints);

    return {
      valid: errors.length === 0,
      diagnostics: [...this.diagnostics],
      constraintMap: new Map(this.constraintMap),
      stats: {
        totalConstraints: allConstraints.length,
        adjacentCount: allConstraints.filter((c) => c.kind === 'spatial_adjacent').length,
        containsCount: allConstraints.filter((c) => c.kind === 'spatial_contains').length,
        reachableCount: allConstraints.filter((c) => c.kind === 'spatial_reachable').length,
        temporalAdjacentCount: allConstraints.filter((c) => c.kind === 'spatial_temporal_adjacent')
          .length,
        temporalReachableCount: allConstraints.filter(
          (c) => c.kind === 'spatial_temporal_reachable'
        ).length,
        trajectoryCount: allConstraints.filter((c) => c.kind === 'spatial_trajectory').length,
        errorsCount: errors.length,
        warningsCount: warnings.length,
      },
    };
  }

  /**
   * Validate a single constraint in isolation (useful for incremental checks).
   */
  validateSingle(
    source: SpatialDeclaration,
    constraint: SpatialConstraint,
    allDeclarations: SpatialDeclaration[]
  ): SpatialConstraintDiagnostic[] {
    this.reset();
    for (const decl of allDeclarations) {
      this.declarations.set(decl.entityId, decl);
    }

    switch (constraint.kind) {
      case 'spatial_adjacent':
        this.validateAdjacent(source, constraint);
        break;
      case 'spatial_contains':
        this.validateContains(source, constraint);
        break;
      case 'spatial_reachable':
        this.validateReachable(source, constraint);
        break;
      case 'spatial_temporal_adjacent':
        this.validateTemporalAdjacent(source, constraint);
        break;
      case 'spatial_temporal_reachable':
        this.validateTemporalReachable(source, constraint);
        break;
      case 'spatial_trajectory':
        this.validateTrajectory(source, constraint);
        break;
    }

    return [...this.diagnostics];
  }

  // -------------------------------------------------------------------------
  // Pass 1: Reference resolution
  // -------------------------------------------------------------------------

  private resolveReferences(): void {
    for (const [entityId, decl] of this.declarations) {
      for (const constraint of decl.constraints) {
        const targetId = this.getTargetId(constraint);
        if (!this.declarations.has(targetId)) {
          // Check if target matches an entity type (wildcard reference)
          const typeMatches = Array.from(this.declarations.values()).filter(
            (d) => d.entityType === targetId
          );
          if (typeMatches.length === 0) {
            this.addDiagnostic(
              'error',
              'HSP033',
              `Spatial constraint on '${entityId}' references target '${targetId}' ` +
                `which is not declared. Ensure the target entity exists in the composition.`,
              decl.line ?? 0,
              decl.column ?? 0,
              constraint.kind,
              entityId,
              targetId,
              [`Declare entity '${targetId}' or fix the target reference.`]
            );
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pass 2: Circular reference detection
  // -------------------------------------------------------------------------

  private detectCircularReferences(): void {
    const visited = new Set<string>();
    const stack = new Set<string>();

    const visit = (entityId: string, path: string[]): void => {
      if (stack.has(entityId)) {
        const cycle = [...path, entityId].join(' -> ');
        const decl = this.declarations.get(entityId);
        this.addDiagnostic(
          'error',
          'HSP034',
          `Circular spatial constraint reference detected: ${cycle}. ` +
            `Spatial constraints must form a directed acyclic graph.`,
          decl?.line ?? 0,
          decl?.column ?? 0,
          'spatial_contains', // containment is the most common source of cycles
          entityId,
          path[path.length - 1] || entityId,
          ['Remove one of the constraints in the cycle to break the circular dependency.']
        );
        return;
      }

      if (visited.has(entityId)) return;

      visited.add(entityId);
      stack.add(entityId);

      const decl = this.declarations.get(entityId);
      if (decl) {
        for (const constraint of decl.constraints) {
          if (constraint.kind === 'spatial_contains') {
            visit(constraint.containedId, [...path, entityId]);
          }
        }
      }

      stack.delete(entityId);
    };

    for (const entityId of this.declarations.keys()) {
      visit(entityId, []);
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3a: Adjacency validation
  // -------------------------------------------------------------------------

  private validateAdjacent(
    source: SpatialDeclaration,
    constraint: SpatialAdjacentConstraint
  ): void {
    const target = this.resolveTarget(constraint.targetId);
    if (!target) return; // Already reported in resolveReferences

    // Both positions must be known at compile time for static verification
    if (!source.position || !target.position) {
      this.addDiagnostic(
        'info',
        'HSP030',
        `spatial_adjacent constraint between '${source.entityId}' and '${constraint.targetId}': ` +
          `positions not fully known at compile time, deferring to runtime verification.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_adjacent',
        source.entityId,
        constraint.targetId
      );
      return;
    }

    const dist = this.computeAxisDistance(
      source.position,
      target.position,
      constraint.axis ?? 'xyz'
    );

    // Check max distance
    if (dist > constraint.maxDistance) {
      this.addDiagnostic(
        'error',
        'HSP030',
        `spatial_adjacent violation: '${source.entityId}' is ${dist.toFixed(2)}m from ` +
          `'${constraint.targetId}' but must be within ${constraint.maxDistance}m` +
          (constraint.axis && constraint.axis !== 'xyz' ? ` (on ${constraint.axis} axis)` : '') +
          `.${constraint.label ? ` (${constraint.label})` : ''}`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_adjacent',
        source.entityId,
        constraint.targetId,
        [
          `Move '${source.entityId}' closer to '${constraint.targetId}' ` +
            `(currently ${dist.toFixed(2)}m, max ${constraint.maxDistance}m).`,
        ]
      );
    }

    // Check min distance
    if (constraint.minDistance !== undefined && dist < constraint.minDistance) {
      this.addDiagnostic(
        'error',
        'HSP030',
        `spatial_adjacent violation: '${source.entityId}' is ${dist.toFixed(2)}m from ` +
          `'${constraint.targetId}' but must be at least ${constraint.minDistance}m apart` +
          `.${constraint.label ? ` (${constraint.label})` : ''}`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_adjacent',
        source.entityId,
        constraint.targetId,
        [
          `Move '${source.entityId}' further from '${constraint.targetId}' ` +
            `(currently ${dist.toFixed(2)}m, min ${constraint.minDistance}m).`,
        ]
      );
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3b: Containment validation
  // -------------------------------------------------------------------------

  private validateContains(
    source: SpatialDeclaration,
    constraint: SpatialContainsConstraint
  ): void {
    const contained = this.resolveTarget(constraint.containedId);
    if (!contained) return;

    // Need bounds on the container
    if (!source.bounds) {
      this.addDiagnostic(
        'warning',
        'HSP031',
        `spatial_contains constraint on '${source.entityId}': container has no declared bounds. ` +
          `Containment cannot be verified at compile time.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_contains',
        source.entityId,
        constraint.containedId,
        [`Add bounds to '${source.entityId}' for compile-time containment checking.`]
      );
      return;
    }

    // Need at least position on the contained entity
    if (!contained.position) {
      this.addDiagnostic(
        'info',
        'HSP031',
        `spatial_contains constraint: '${constraint.containedId}' position not known at compile time, ` +
          `deferring to runtime.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_contains',
        source.entityId,
        constraint.containedId
      );
      return;
    }

    const margin = constraint.margin ?? 0;

    if (constraint.strict && contained.bounds) {
      // Strict mode: contained entity's full bounds must be inside
      this.validateStrictContainment(source, constraint, contained, margin);
    } else {
      // Non-strict: check center point
      this.validatePointContainment(source, constraint, contained.position, margin);
    }

    // Recursive check
    if (constraint.recursive) {
      this.validateRecursiveContainment(source, constraint);
    }
  }

  /**
   * Check that a point is inside the container bounds (with margin).
   */
  private validatePointContainment(
    container: SpatialDeclaration,
    constraint: SpatialContainsConstraint,
    point: Vector3,
    margin: number
  ): void {
    const bounds = container.bounds!;
    let isInside: boolean;

    if ('radius' in bounds) {
      // Sphere containment
      const sphere = bounds as BoundingSphere;
      const dist = distance(point, sphere.center);
      isInside = dist <= sphere.radius - margin;
    } else {
      // Box containment
      const box = bounds as BoundingBox;
      const shrunk: BoundingBox = {
        min: {
          x: box.min.x + margin,
          y: box.min.y + margin,
          z: box.min.z + margin,
        },
        max: {
          x: box.max.x - margin,
          y: box.max.y - margin,
          z: box.max.z - margin,
        },
      };
      isInside = isPointInBox(point, shrunk);
    }

    if (!isInside) {
      this.addDiagnostic(
        'error',
        'HSP031',
        `spatial_contains violation: '${constraint.containedId}' ` +
          `(at [${point.x}, ${point.y}, ${point.z}]) is outside ` +
          `container '${container.entityId}'` +
          (margin > 0 ? ` (with margin ${margin}m)` : '') +
          `.${constraint.label ? ` (${constraint.label})` : ''}`,
        container.line ?? 0,
        container.column ?? 0,
        'spatial_contains',
        container.entityId,
        constraint.containedId,
        [
          `Move '${constraint.containedId}' inside '${container.entityId}' bounds.`,
          `Alternatively, increase the container's bounds to enclose the target.`,
        ]
      );
    }
  }

  /**
   * Strict containment: contained entity's full bounds must be inside container.
   */
  private validateStrictContainment(
    container: SpatialDeclaration,
    constraint: SpatialContainsConstraint,
    contained: SpatialDeclaration,
    margin: number
  ): void {
    if (!contained.bounds || !container.bounds) return;

    const containerBox = this.toBoundingBox(container.bounds);
    const containedBox = this.toBoundingBox(contained.bounds, contained.position);

    // Shrink container by margin
    const shrunk: BoundingBox = {
      min: {
        x: containerBox.min.x + margin,
        y: containerBox.min.y + margin,
        z: containerBox.min.z + margin,
      },
      max: {
        x: containerBox.max.x - margin,
        y: containerBox.max.y - margin,
        z: containerBox.max.z - margin,
      },
    };

    const fullyInside =
      containedBox.min.x >= shrunk.min.x &&
      containedBox.min.y >= shrunk.min.y &&
      containedBox.min.z >= shrunk.min.z &&
      containedBox.max.x <= shrunk.max.x &&
      containedBox.max.y <= shrunk.max.y &&
      containedBox.max.z <= shrunk.max.z;

    if (!fullyInside) {
      this.addDiagnostic(
        'error',
        'HSP031',
        `spatial_contains (strict) violation: '${constraint.containedId}' ` +
          `bounds extend outside container '${container.entityId}'` +
          (margin > 0 ? ` (with margin ${margin}m)` : '') +
          `.${constraint.label ? ` (${constraint.label})` : ''}`,
        container.line ?? 0,
        container.column ?? 0,
        'spatial_contains',
        container.entityId,
        constraint.containedId,
        [
          `Resize '${constraint.containedId}' to fit within '${container.entityId}'.`,
          `Alternatively, enlarge '${container.entityId}' bounds.`,
        ]
      );
    }
  }

  /**
   * Recursively check containment for child entities.
   */
  private validateRecursiveContainment(
    container: SpatialDeclaration,
    constraint: SpatialContainsConstraint
  ): void {
    // Find all entities whose parentId matches the contained entity
    const contained = this.declarations.get(constraint.containedId);
    if (!contained) return;

    for (const [, decl] of this.declarations) {
      if (decl.parentId === constraint.containedId && decl.position && container.bounds) {
        this.validatePointContainment(
          container,
          {
            ...constraint,
            containedId: decl.entityId,
            label: `recursive child of '${constraint.containedId}'`,
          },
          decl.position,
          constraint.margin ?? 0
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3c: Reachability validation
  // -------------------------------------------------------------------------

  private validateReachable(
    source: SpatialDeclaration,
    constraint: SpatialReachableConstraint
  ): void {
    const target = this.resolveTarget(constraint.targetId);
    if (!target) return;

    if (!source.position || !target.position) {
      this.addDiagnostic(
        'info',
        'HSP032',
        `spatial_reachable constraint between '${source.entityId}' and '${constraint.targetId}': ` +
          `positions not known at compile time, deferring to runtime.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_reachable',
        source.entityId,
        constraint.targetId
      );
      return;
    }

    // Compile-time reachability: check line-of-sight through known obstacles
    const straightDist = distance(source.position, target.position);

    // Check max path length (straight line is a lower bound)
    if (constraint.maxPathLength !== undefined && straightDist > constraint.maxPathLength) {
      this.addDiagnostic(
        'error',
        'HSP032',
        `spatial_reachable violation: straight-line distance from '${source.entityId}' ` +
          `to '${constraint.targetId}' is ${straightDist.toFixed(2)}m, exceeding ` +
          `maxPathLength of ${constraint.maxPathLength}m. No valid path can exist.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_reachable',
        source.entityId,
        constraint.targetId,
        [
          `Move '${source.entityId}' closer to '${constraint.targetId}' ` +
            `or increase maxPathLength.`,
        ]
      );
      return;
    }

    // Check line-of-sight through declared obstacles
    if (constraint.obstacleTypes && constraint.obstacleTypes.length > 0) {
      const blockingObstacle = this.checkLineOfSight(
        source.position,
        target.position,
        constraint.obstacleTypes,
        source.entityId,
        constraint.targetId
      );

      if (blockingObstacle) {
        const severity: SpatialDiagnosticSeverity =
          constraint.algorithm === 'line_of_sight' ? 'error' : 'warning';

        this.addDiagnostic(
          severity,
          'HSP032',
          `spatial_reachable: line-of-sight from '${source.entityId}' to ` +
            `'${constraint.targetId}' is blocked by '${blockingObstacle}'` +
            (constraint.algorithm && constraint.algorithm !== 'line_of_sight'
              ? `. A ${constraint.algorithm} path may still exist (runtime check required).`
              : '.') +
            (constraint.label ? ` (${constraint.label})` : ''),
          source.line ?? 0,
          source.column ?? 0,
          'spatial_reachable',
          source.entityId,
          constraint.targetId,
          [
            `Remove or reposition obstacle '${blockingObstacle}' to clear the path.`,
            `Alternatively, use algorithm: "navmesh" or "astar" for path-around-obstacles.`,
          ]
        );
      }
    }
  }

  /**
   * Check line-of-sight between two points through known obstacles.
   * Returns the ID of the first blocking obstacle, or null if clear.
   */
  private checkLineOfSight(
    from: Vector3,
    to: Vector3,
    obstacleTypes: string[],
    excludeA: string,
    excludeB: string
  ): string | null {
    const dir = subtract(to, from);
    const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    if (len === 0) return null;

    const normalizedDir = normalize(dir);

    for (const [entityId, decl] of this.declarations) {
      if (entityId === excludeA || entityId === excludeB) continue;
      if (!obstacleTypes.includes(decl.entityType)) continue;
      if (!decl.bounds) continue;

      // Ray-AABB intersection test
      const box = this.toBoundingBox(decl.bounds, decl.position);
      if (this.rayIntersectsBox(from, normalizedDir, box, len)) {
        return entityId;
      }
    }

    return null;
  }

  // -------------------------------------------------------------------------
  // Pass 3d: Temporal adjacency validation
  // -------------------------------------------------------------------------

  private validateTemporalAdjacent(
    source: SpatialDeclaration,
    constraint: SpatialTemporalAdjacentConstraint
  ): void {
    const target = this.resolveTarget(constraint.targetId);
    if (!target) return; // Already reported in resolveReferences

    // Validate configuration: minDuration must be non-negative
    if (constraint.minDuration < 0) {
      this.addDiagnostic(
        'error',
        'HSP036',
        `spatial_temporal_adjacent on '${source.entityId}': minDuration must be >= 0 ` +
          `(got ${constraint.minDuration}s).`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_adjacent',
        source.entityId,
        constraint.targetId,
        ['Set minDuration to a non-negative value.']
      );
      return;
    }

    // Validate gracePeriod
    if (constraint.gracePeriod !== undefined && constraint.gracePeriod < 0) {
      this.addDiagnostic(
        'error',
        'HSP036',
        `spatial_temporal_adjacent on '${source.entityId}': gracePeriod must be >= 0 ` +
          `(got ${constraint.gracePeriod}s).`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_adjacent',
        source.entityId,
        constraint.targetId,
        ['Set gracePeriod to a non-negative value.']
      );
      return;
    }

    // Warn if gracePeriod exceeds minDuration (probably a config error)
    if (
      constraint.gracePeriod !== undefined &&
      constraint.gracePeriod > constraint.minDuration &&
      constraint.minDuration > 0
    ) {
      this.addDiagnostic(
        'warning',
        'HSP036',
        `spatial_temporal_adjacent on '${source.entityId}': gracePeriod (${constraint.gracePeriod}s) ` +
          `exceeds minDuration (${constraint.minDuration}s). The grace period allows the entity ` +
          `to remain out of range longer than the required adjacency duration.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_adjacent',
        source.entityId,
        constraint.targetId,
        ['Consider reducing gracePeriod or increasing minDuration.']
      );
    }

    // If both positions are known, verify static adjacency is achievable
    if (source.position && target.position) {
      const dist = this.computeAxisDistance(
        source.position,
        target.position,
        constraint.axis ?? 'xyz'
      );

      if (dist > constraint.maxDistance) {
        this.addDiagnostic(
          'error',
          'HSP036',
          `spatial_temporal_adjacent violation: '${source.entityId}' is ${dist.toFixed(2)}m from ` +
            `'${constraint.targetId}' (max: ${constraint.maxDistance}m). The duration constraint ` +
            `of ${constraint.minDuration}s cannot be satisfied if entities start out of range` +
            (constraint.axis && constraint.axis !== 'xyz' ? ` (on ${constraint.axis} axis)` : '') +
            `.${constraint.label ? ` (${constraint.label})` : ''}`,
          source.line ?? 0,
          source.column ?? 0,
          'spatial_temporal_adjacent',
          source.entityId,
          constraint.targetId,
          [
            `Move '${source.entityId}' within ${constraint.maxDistance}m of '${constraint.targetId}'.`,
            `Or ensure runtime movement brings entities into range.`,
          ]
        );
      }
    } else {
      this.addDiagnostic(
        'info',
        'HSP036',
        `spatial_temporal_adjacent between '${source.entityId}' and '${constraint.targetId}': ` +
          `positions not fully known at compile time. Duration constraint ` +
          `(${constraint.minDuration}s hold, ${constraint.gracePeriod ?? 0}s grace) ` +
          `will be verified at runtime.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_adjacent',
        source.entityId,
        constraint.targetId
      );
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3e: Temporal reachability validation
  // -------------------------------------------------------------------------

  private validateTemporalReachable(
    source: SpatialDeclaration,
    constraint: SpatialTemporalReachableConstraint
  ): void {
    const target = this.resolveTarget(constraint.targetId);
    if (!target) return;

    // Validate predictionHorizon
    if (constraint.predictionHorizon <= 0) {
      this.addDiagnostic(
        'error',
        'HSP037',
        `spatial_temporal_reachable on '${source.entityId}': predictionHorizon must be > 0 ` +
          `(got ${constraint.predictionHorizon}s).`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_reachable',
        source.entityId,
        constraint.targetId,
        ['Set predictionHorizon to a positive value.']
      );
      return;
    }

    // Validate safetyMargin
    if (constraint.safetyMargin !== undefined && constraint.safetyMargin < 0) {
      this.addDiagnostic(
        'error',
        'HSP037',
        `spatial_temporal_reachable on '${source.entityId}': safetyMargin must be >= 0 ` +
          `(got ${constraint.safetyMargin}m).`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_reachable',
        source.entityId,
        constraint.targetId,
        ['Set safetyMargin to a non-negative value.']
      );
      return;
    }

    // Warn if no moving obstacles are specified (should use regular spatial_reachable)
    if (
      (!constraint.movingObstacles || constraint.movingObstacles.length === 0) &&
      (!constraint.staticObstacles || constraint.staticObstacles.length === 0)
    ) {
      this.addDiagnostic(
        'warning',
        'HSP037',
        `spatial_temporal_reachable on '${source.entityId}': no moving or static obstacles specified. ` +
          `Consider using spatial_reachable instead if velocity prediction is not needed.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_reachable',
        source.entityId,
        constraint.targetId,
        [
          'Add movingObstacles or staticObstacles to the constraint.',
          'Or use @spatial_reachable if velocity prediction is not needed.',
        ]
      );
    }

    // Static distance check (same as reachable)
    if (source.position && target.position) {
      const straightDist = distance(source.position, target.position);
      if (constraint.maxPathLength !== undefined && straightDist > constraint.maxPathLength) {
        this.addDiagnostic(
          'error',
          'HSP037',
          `spatial_temporal_reachable violation: straight-line distance from '${source.entityId}' ` +
            `to '${constraint.targetId}' is ${straightDist.toFixed(2)}m, exceeding ` +
            `maxPathLength of ${constraint.maxPathLength}m. No valid path can exist ` +
            `(prediction horizon: ${constraint.predictionHorizon}s).`,
          source.line ?? 0,
          source.column ?? 0,
          'spatial_temporal_reachable',
          source.entityId,
          constraint.targetId,
          [
            `Move '${source.entityId}' closer to '${constraint.targetId}' or increase maxPathLength.`,
          ]
        );
      }
    } else {
      this.addDiagnostic(
        'info',
        'HSP037',
        `spatial_temporal_reachable between '${source.entityId}' and '${constraint.targetId}': ` +
          `positions not known at compile time. Velocity-predicted reachability ` +
          `(horizon: ${constraint.predictionHorizon}s) will be verified at runtime.`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_temporal_reachable',
        source.entityId,
        constraint.targetId
      );
    }
  }

  // -------------------------------------------------------------------------
  // Pass 3f: Trajectory validation
  // -------------------------------------------------------------------------

  private validateTrajectory(
    source: SpatialDeclaration,
    constraint: SpatialTrajectoryConstraint
  ): void {
    // Validate horizon
    if (constraint.horizon <= 0) {
      this.addDiagnostic(
        'error',
        'HSP038',
        `spatial_trajectory on '${source.entityId}': horizon must be > 0 ` +
          `(got ${constraint.horizon}s).`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_trajectory',
        source.entityId,
        constraint.regionId ?? source.entityId,
        ['Set horizon to a positive value.']
      );
      return;
    }

    // Validate sampleCount
    if (constraint.sampleCount !== undefined && constraint.sampleCount < 1) {
      this.addDiagnostic(
        'error',
        'HSP038',
        `spatial_trajectory on '${source.entityId}': sampleCount must be >= 1 ` +
          `(got ${constraint.sampleCount}).`,
        source.line ?? 0,
        source.column ?? 0,
        'spatial_trajectory',
        source.entityId,
        constraint.regionId ?? source.entityId,
        ['Set sampleCount to at least 1.']
      );
      return;
    }

    // Mode-specific validation
    switch (constraint.mode) {
      case 'keep_in':
      case 'keep_out': {
        // Must specify a regionId
        if (!constraint.regionId) {
          this.addDiagnostic(
            'error',
            'HSP038',
            `spatial_trajectory (${constraint.mode}) on '${source.entityId}': ` +
              `regionId is required for '${constraint.mode}' mode.`,
            source.line ?? 0,
            source.column ?? 0,
            'spatial_trajectory',
            source.entityId,
            source.entityId,
            [`Add regionId to the @spatial_trajectory constraint.`]
          );
        } else {
          // Check that region entity exists and has bounds
          const region = this.resolveTarget(constraint.regionId);
          if (region && !region.bounds) {
            this.addDiagnostic(
              'warning',
              'HSP038',
              `spatial_trajectory (${constraint.mode}) on '${source.entityId}': ` +
                `region '${constraint.regionId}' has no declared bounds. ` +
                `Trajectory containment cannot be verified at compile time.`,
              source.line ?? 0,
              source.column ?? 0,
              'spatial_trajectory',
              source.entityId,
              constraint.regionId,
              [`Add bounds to '${constraint.regionId}' for compile-time trajectory checking.`]
            );
          }
        }
        break;
      }

      case 'follow': {
        // Must specify reference path
        if (!constraint.referencePath || constraint.referencePath.length < 2) {
          this.addDiagnostic(
            'error',
            'HSP038',
            `spatial_trajectory (follow) on '${source.entityId}': ` +
              `referencePath must contain at least 2 points for 'follow' mode ` +
              `(got ${constraint.referencePath?.length ?? 0}).`,
            source.line ?? 0,
            source.column ?? 0,
            'spatial_trajectory',
            source.entityId,
            constraint.regionId ?? source.entityId,
            ['Provide a referencePath with at least 2 waypoints.']
          );
        }

        // maxDeviation must be positive
        if (constraint.maxDeviation !== undefined && constraint.maxDeviation <= 0) {
          this.addDiagnostic(
            'error',
            'HSP038',
            `spatial_trajectory (follow) on '${source.entityId}': ` +
              `maxDeviation must be > 0 (got ${constraint.maxDeviation}m).`,
            source.line ?? 0,
            source.column ?? 0,
            'spatial_trajectory',
            source.entityId,
            constraint.regionId ?? source.entityId,
            ['Set maxDeviation to a positive value.']
          );
        }

        // If source position is known, check it's near the reference path
        if (source.position && constraint.referencePath && constraint.referencePath.length >= 2) {
          const distToStart = distance(source.position, constraint.referencePath[0]);
          const maxDev = constraint.maxDeviation ?? 1.0;
          if (distToStart > maxDev * 3) {
            this.addDiagnostic(
              'warning',
              'HSP038',
              `spatial_trajectory (follow) on '${source.entityId}': entity starts ` +
                `${distToStart.toFixed(2)}m from the reference path origin ` +
                `(maxDeviation: ${maxDev}m). The entity may immediately violate the constraint.`,
              source.line ?? 0,
              source.column ?? 0,
              'spatial_trajectory',
              source.entityId,
              constraint.regionId ?? source.entityId,
              [`Move '${source.entityId}' closer to the reference path start point.`]
            );
          }
        }
        break;
      }

      case 'waypoint': {
        // Must specify waypoints
        if (!constraint.waypoints || constraint.waypoints.length === 0) {
          this.addDiagnostic(
            'error',
            'HSP038',
            `spatial_trajectory (waypoint) on '${source.entityId}': ` +
              `at least one waypoint is required for 'waypoint' mode.`,
            source.line ?? 0,
            source.column ?? 0,
            'spatial_trajectory',
            source.entityId,
            constraint.regionId ?? source.entityId,
            ['Add waypoints with position and radius to the constraint.']
          );
        } else {
          // Validate each waypoint has positive radius
          for (let i = 0; i < constraint.waypoints.length; i++) {
            const wp = constraint.waypoints[i];
            if (wp.radius <= 0) {
              this.addDiagnostic(
                'error',
                'HSP038',
                `spatial_trajectory (waypoint) on '${source.entityId}': ` +
                  `waypoint ${i} (${wp.label ?? 'unnamed'}) has invalid radius ${wp.radius}m. ` +
                  `Radius must be > 0.`,
                source.line ?? 0,
                source.column ?? 0,
                'spatial_trajectory',
                source.entityId,
                constraint.regionId ?? source.entityId,
                [`Set waypoint ${i} radius to a positive value.`]
              );
            }
          }
        }
        break;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Pass 4: Cross-constraint consistency
  // -------------------------------------------------------------------------

  private validateCrossConstraintConsistency(): void {
    // Check: if A must be adjacent to B AND A must be contained in C,
    // verify that B is reachable from within C's bounds.
    for (const [entityId, decl] of this.declarations) {
      const adjacentTargets = decl.constraints
        .filter((c): c is SpatialAdjacentConstraint => c.kind === 'spatial_adjacent')
        .map((c) => c.targetId);

      const containedIn = this.findContainers(entityId);

      for (const adjacentTarget of adjacentTargets) {
        for (const containerId of containedIn) {
          const container = this.declarations.get(containerId);
          const target = this.resolveTarget(adjacentTarget);

          if (container?.bounds && target?.position) {
            // Check that the adjacent target is at least partially reachable
            // from the container
            const isTargetReachable = this.isPointNearBounds(
              target.position,
              container.bounds,
              // Use the max distance from the adjacency constraint
              decl.constraints
                .filter(
                  (c): c is SpatialAdjacentConstraint =>
                    c.kind === 'spatial_adjacent' && c.targetId === adjacentTarget
                )
                .map((c) => c.maxDistance)[0] ?? Infinity
            );

            if (!isTargetReachable) {
              this.addDiagnostic(
                'warning',
                'HSP035',
                `Potential inconsistency: '${entityId}' must be adjacent to ` +
                  `'${adjacentTarget}' but is contained in '${containerId}'. ` +
                  `'${adjacentTarget}' appears to be outside the container's reachable range.`,
                decl.line ?? 0,
                decl.column ?? 0,
                'spatial_adjacent',
                entityId,
                adjacentTarget,
                [
                  `Ensure '${adjacentTarget}' is placed near '${containerId}' bounds.`,
                  `Or adjust the adjacency maxDistance to account for container size.`,
                ]
              );
            }
          }
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Utility methods
  // -------------------------------------------------------------------------

  /**
   * Reset all internal state for a new validation run.
   */
  private reset(): void {
    this.declarations.clear();
    this.diagnostics = [];
    this.constraintMap.clear();
  }

  /**
   * Add a diagnostic to the list.
   */
  private addDiagnostic(
    severity: SpatialDiagnosticSeverity,
    code: string,
    message: string,
    line: number,
    column: number,
    constraintKind: SpatialConstraintKind,
    sourceId: string,
    targetId: string,
    suggestions?: string[]
  ): void {
    this.diagnostics.push({
      severity,
      code,
      message,
      line,
      column,
      constraintKind,
      sourceId,
      targetId,
      suggestions,
    });
  }

  /**
   * Resolve a target ID to a declaration, including type-based matching.
   */
  private resolveTarget(targetId: string): SpatialDeclaration | null {
    const direct = this.declarations.get(targetId);
    if (direct) return direct;

    // Try matching by entity type
    for (const [, decl] of this.declarations) {
      if (decl.entityType === targetId) return decl;
    }

    return null;
  }

  /**
   * Get the target ID from any spatial constraint.
   */
  private getTargetId(constraint: SpatialConstraint): string {
    switch (constraint.kind) {
      case 'spatial_adjacent':
        return constraint.targetId;
      case 'spatial_contains':
        return constraint.containedId;
      case 'spatial_reachable':
        return constraint.targetId;
      case 'spatial_temporal_adjacent':
        return constraint.targetId;
      case 'spatial_temporal_reachable':
        return constraint.targetId;
      case 'spatial_trajectory':
        return constraint.regionId ?? constraint.sourceId;
    }
  }

  /**
   * Compute distance along a specific axis filter.
   */
  computeAxisDistance(a: Vector3, b: Vector3, axis: SpatialAxis): number {
    switch (axis) {
      case 'x':
        return Math.abs(b.x - a.x);
      case 'y':
        return Math.abs(b.y - a.y);
      case 'z':
        return Math.abs(b.z - a.z);
      case 'xy': {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        return Math.sqrt(dx * dx + dy * dy);
      }
      case 'xz': {
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        return Math.sqrt(dx * dx + dz * dz);
      }
      case 'xyz':
      default:
        return distance(a, b);
    }
  }

  /**
   * Convert any bounds type to a BoundingBox, optionally offset by position.
   */
  private toBoundingBox(bounds: BoundingBox | BoundingSphere, offset?: Vector3): BoundingBox {
    const ox = offset?.x ?? 0;
    const oy = offset?.y ?? 0;
    const oz = offset?.z ?? 0;

    if ('radius' in bounds) {
      const sphere = bounds as BoundingSphere;
      return {
        min: {
          x: sphere.center.x + ox - sphere.radius,
          y: sphere.center.y + oy - sphere.radius,
          z: sphere.center.z + oz - sphere.radius,
        },
        max: {
          x: sphere.center.x + ox + sphere.radius,
          y: sphere.center.y + oy + sphere.radius,
          z: sphere.center.z + oz + sphere.radius,
        },
      };
    }

    const box = bounds as BoundingBox;
    return {
      min: { x: box.min.x + ox, y: box.min.y + oy, z: box.min.z + oz },
      max: { x: box.max.x + ox, y: box.max.y + oy, z: box.max.z + oz },
    };
  }

  /**
   * Ray-AABB intersection test.
   */
  private rayIntersectsBox(
    origin: Vector3,
    direction: Vector3,
    box: BoundingBox,
    maxDist: number
  ): boolean {
    let tmin = -Infinity;
    let tmax = Infinity;

    const axes: Array<'x' | 'y' | 'z'> = ['x', 'y', 'z'];
    for (const axis of axes) {
      const d = direction[axis];
      const o = origin[axis];
      const bmin = box.min[axis];
      const bmax = box.max[axis];

      if (Math.abs(d) < 1e-10) {
        // Ray parallel to slab
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

    return tmin >= 0 && tmin <= maxDist;
  }

  /**
   * Check if a point is within `extraRadius` of a bounding volume.
   */
  private isPointNearBounds(
    point: Vector3,
    bounds: BoundingBox | BoundingSphere,
    extraRadius: number
  ): boolean {
    if ('radius' in bounds) {
      const sphere = bounds as BoundingSphere;
      return distance(point, sphere.center) <= sphere.radius + extraRadius;
    }

    const box = bounds as BoundingBox;
    const expanded: BoundingBox = {
      min: {
        x: box.min.x - extraRadius,
        y: box.min.y - extraRadius,
        z: box.min.z - extraRadius,
      },
      max: {
        x: box.max.x + extraRadius,
        y: box.max.y + extraRadius,
        z: box.max.z + extraRadius,
      },
    };
    return isPointInBox(point, expanded);
  }

  /**
   * Find all containers that declare spatial_contains with a given entity.
   */
  private findContainers(entityId: string): string[] {
    const containers: string[] = [];
    for (const [containerId, decl] of this.declarations) {
      for (const constraint of decl.constraints) {
        if (constraint.kind === 'spatial_contains' && constraint.containedId === entityId) {
          containers.push(containerId);
        }
      }
    }
    return containers;
  }
}
