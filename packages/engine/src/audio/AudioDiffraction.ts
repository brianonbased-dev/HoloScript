import type { Vector3 } from '@holoscript/core';
/**
 * AudioDiffraction.ts
 *
 * Advanced diffraction modeling for spatial audio:
 * - Edge detection for diffraction points
 * - Kirchhoff-Fresnel diffraction coefficient calculation
 * - Secondary raycast paths for indirect sound propagation
 * - Integration with AudioOcclusion system
 *
 * @module audio
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DiffractionEdge {
  id: string;
  point1: Vector3;
  point2: Vector3;
  obstacleId?: string; // Optional reference to obstacle
}

export interface DiffractionPath {
  edgeId: string;
  diffractionPoint: Vector3;
  totalDistance: number; // Source -> edge -> listener
  directDistance: number; // Direct source -> listener
  pathDifference: number; // Extra distance via edge
  diffractionCoefficient: number; // 0-1 (Fresnel-based attenuation)
  angle: number; // Diffraction angle in radians
}

export interface DiffractionResult {
  sourceId: string;
  hasDiffraction: boolean;
  paths: DiffractionPath[]; // All valid diffraction paths
  combinedCoefficient: number; // Combined diffraction effect (0-1)
  volumeMultiplier: number; // Final volume multiplier
}

export interface DiffractionConfig {
  enabled: boolean;
  maxPaths: number; // Max diffraction paths to compute (1-3)
  minDiffractionGain: number; // Min coefficient to consider (e.g., 0.01)
  frequency: number; // Reference frequency for Fresnel calc (Hz)
  speedOfSound: number; // m/s (default 343)
}

// =============================================================================
// EDGE DETECTION PROVIDER
// =============================================================================

/**
 * Provider function to detect edges in the scene.
 * Implementations should return edges that could cause diffraction.
 */
export type EdgeDetectionProvider = (
  sourcePos: Vector3,
  listenerPos: Vector3
) => DiffractionEdge[];

/**
 * Provider function to check line-of-sight between two points.
 * Returns true if the path is clear, false if obstructed.
 */
export type LineOfSightProvider = (
  point1: Vector3,
  point2: Vector3
) => boolean;

// =============================================================================
// AUDIO DIFFRACTION SYSTEM
// =============================================================================

export class AudioDiffractionSystem {
  private config: DiffractionConfig = {
    enabled: true,
    maxPaths: 2, // Compute up to 2 diffraction paths
    minDiffractionGain: 0.01, // Ignore paths with <1% contribution
    frequency: 1000, // 1kHz reference frequency
    speedOfSound: 343, // m/s at 20°C
  };

  private edgeProvider: EdgeDetectionProvider | null = null;
  private losProvider: LineOfSightProvider | null = null;
  private cache: Map<string, DiffractionResult> = new Map();

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setConfig(config: Partial<DiffractionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  getConfig(): DiffractionConfig {
    return { ...this.config };
  }

  setEdgeDetectionProvider(provider: EdgeDetectionProvider): void {
    this.edgeProvider = provider;
  }

  setLineOfSightProvider(provider: LineOfSightProvider): void {
    this.losProvider = provider;
  }

  // ---------------------------------------------------------------------------
  // Diffraction Computation
  // ---------------------------------------------------------------------------

  /**
   * Compute diffraction paths between source and listener.
   * Returns all valid diffraction paths sorted by coefficient (strongest first).
   */
  computeDiffraction(
    sourcePos: Vector3,
    listenerPos: Vector3,
    sourceId: string
  ): DiffractionResult {
    if (!this.config.enabled || !this.edgeProvider || !this.losProvider) {
      return {
        sourceId,
        hasDiffraction: false,
        paths: [],
        combinedCoefficient: 0,
        volumeMultiplier: 1,
      };
    }

    // Check if direct path is clear
    const hasDirectPath = this.losProvider(sourcePos, listenerPos);

    // If direct path exists, no diffraction needed
    if (hasDirectPath) {
      const result: DiffractionResult = {
        sourceId,
        hasDiffraction: false,
        paths: [],
        combinedCoefficient: 0,
        volumeMultiplier: 1,
      };
      this.cache.set(sourceId, result);
      return result;
    }

    // Get potential diffraction edges
    const edges = this.edgeProvider(sourcePos, listenerPos);

    // Compute diffraction paths for each edge
    const paths: DiffractionPath[] = [];
    for (const edge of edges) {
      const path = this.computeEdgeDiffraction(edge, sourcePos, listenerPos);
      if (path && path.diffractionCoefficient >= this.config.minDiffractionGain) {
        paths.push(path);
      }
    }

    // Sort by diffraction coefficient (strongest first)
    paths.sort((a, b) => b.diffractionCoefficient - a.diffractionCoefficient);

    // Limit to max paths
    const validPaths = paths.slice(0, this.config.maxPaths);

    // Combine diffraction coefficients (energy-based combination)
    const combinedCoefficient = this.combineDiffractionPaths(validPaths);

    const result: DiffractionResult = {
      sourceId,
      hasDiffraction: validPaths.length > 0,
      paths: validPaths,
      combinedCoefficient,
      volumeMultiplier: combinedCoefficient,
    };

    this.cache.set(sourceId, result);
    return result;
  }

  /**
   * Compute diffraction for a specific edge.
   * Returns null if edge is not valid for diffraction.
   */
  private computeEdgeDiffraction(
    edge: DiffractionEdge,
    sourcePos: Vector3,
    listenerPos: Vector3
  ): DiffractionPath | null {
    if (!this.losProvider) return null;

    // Find closest point on edge to both source and listener
    const edgePoint = this.findDiffractionPoint(edge, sourcePos, listenerPos);

    // Check if both segments are clear
    const sourceToEdge = this.losProvider(sourcePos, edgePoint);
    const edgeToListener = this.losProvider(edgePoint, listenerPos);

    if (!sourceToEdge || !edgeToListener) {
      return null; // Path is obstructed
    }

    // Calculate distances
    const d1 = this.distance3D(sourcePos, edgePoint);
    const d2 = this.distance3D(edgePoint, listenerPos);
    const totalDistance = d1 + d2;
    const directDistance = this.distance3D(sourcePos, listenerPos);
    const pathDifference = totalDistance - directDistance;

    // Calculate diffraction angle
    const angle = this.calculateDiffractionAngle(sourcePos, edgePoint, listenerPos);

    // Calculate Fresnel-based diffraction coefficient
    const coefficient = this.calculateFresnelCoefficient(pathDifference, angle);

    return {
      edgeId: edge.id,
      diffractionPoint: edgePoint,
      totalDistance,
      directDistance,
      pathDifference,
      diffractionCoefficient: coefficient,
      angle,
    };
  }

  /**
   * Find the optimal diffraction point on an edge.
   * Uses closest point on line segment to the midpoint between source and listener.
   */
  private findDiffractionPoint(
    edge: DiffractionEdge,
    sourcePos: Vector3,
    listenerPos: Vector3
  ): Vector3 {
    // Simplified: use midpoint of source and listener projected onto edge
    const midpoint: Vector3 = [
      (sourcePos[0] + listenerPos[0]) / 2,
      (sourcePos[1] + listenerPos[1]) / 2,
      (sourcePos[2] + listenerPos[2]) / 2,
    ];

    return this.closestPointOnSegment(edge.point1, edge.point2, midpoint);
  }

  /**
   * Calculate the diffraction angle in radians.
   * This is the angle between source->edge and edge->listener vectors.
   */
  private calculateDiffractionAngle(
    sourcePos: Vector3,
    edgePoint: Vector3,
    listenerPos: Vector3
  ): number {
    // Vector from edge to source
    const v1 = [sourcePos[0] - edgePoint[0], sourcePos[1] - edgePoint[1], sourcePos[2] - edgePoint[2],
    ];

    // Vector from edge to listener
    const v2 = [listenerPos[0] - edgePoint[0], listenerPos[1] - edgePoint[1], listenerPos[2] - edgePoint[2],
    ];

    // Normalize
    const len1 = Math.sqrt(v1[0] * v1[0] + v1[1] * v1[1] + v1[2] * v1[2]);
    const len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);

    if (len1 === 0 || len2 === 0) return 0;

    v1[0] /= len1;
    v1[1] /= len1;
    v1[2] /= len1;
    v2[0] /= len2;
    v2[1] /= len2;
    v2[2] /= len2;

    // Dot product
    const dot = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];

    // Clamp to [-1, 1] for acos stability
    const clampedDot = Math.max(-1, Math.min(1, dot));

    return Math.acos(clampedDot);
  }

  /**
   * Calculate Fresnel diffraction coefficient.
   * Based on Kirchhoff-Fresnel theory for edge diffraction.
   *
   * @param pathDifference - Extra distance traveled via edge (meters)
   * @param angle - Diffraction angle (radians)
   * @returns Attenuation coefficient (0-1)
   */
  private calculateFresnelCoefficient(pathDifference: number, angle: number): number {
    // Wavelength = speed of sound / frequency
    const wavelength = this.config.speedOfSound / this.config.frequency;

    // Fresnel number: v = sqrt(2 * pathDiff / wavelength)
    const v = Math.sqrt((2 * pathDifference) / wavelength);

    // Simplified Fresnel approximation for knife-edge diffraction
    // For v > 0 (obstructed), attenuation increases with v
    let coefficient: number;

    if (v <= -1) {
      // Strong positive zone (unobstructed)
      coefficient = 1.0;
    } else if (v >= 1) {
      // Shadow zone
      coefficient = 0.5 / (v * v); // Rapid attenuation
    } else {
      // Transition zone
      coefficient = 0.5 * (1 - v);
    }

    // Apply angle-based attenuation (less diffraction at sharp angles)
    const angleFactor = Math.sin(angle / 2);
    coefficient *= angleFactor;

    return Math.max(0, Math.min(1, coefficient));
  }

  /**
   * Combine multiple diffraction paths using energy-based summation.
   * Paths contribute independently (incoherent sum).
   */
  private combineDiffractionPaths(paths: DiffractionPath[]): number {
    if (paths.length === 0) return 0;

    // Energy-based combination (sum of squared coefficients, then sqrt)
    const sumSquared = paths.reduce((sum, path) => {
      return sum + path.diffractionCoefficient * path.diffractionCoefficient;
    }, 0);

    return Math.sqrt(sumSquared);
  }

  // ---------------------------------------------------------------------------
  // Geometry Utilities
  // ---------------------------------------------------------------------------

  private distance3D(
    p1: Vector3,
    p2: Vector3
  ): number {
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    const dz = p2[2] - p1[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Find closest point on line segment AB to point P.
   */
  private closestPointOnSegment(
    a: Vector3,
    b: Vector3,
    p: Vector3
  ): Vector3 {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2] ];
    const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2] ];

    const abLenSq = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];

    if (abLenSq === 0) return [...a]; // A and B are the same point

    const t = Math.max(0, Math.min(1, (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / abLenSq));

    return [a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2],
    ];
  }

  // ---------------------------------------------------------------------------
  // Cache Management
  // ---------------------------------------------------------------------------

  getCachedResult(sourceId: string): DiffractionResult | undefined {
    return this.cache.get(sourceId);
  }

  clearCache(): void {
    this.cache.clear();
  }

  // ---------------------------------------------------------------------------
  // Integration Helpers
  // ---------------------------------------------------------------------------

  /**
   * Get volume multiplier for a source based on diffraction.
   * Returns 1.0 if direct path exists, otherwise returns diffraction coefficient.
   */
  getVolumeMultiplier(sourceId: string): number {
    const result = this.cache.get(sourceId);
    return result?.volumeMultiplier ?? 1.0;
  }

  /**
   * Check if a source has active diffraction paths.
   */
  hasDiffraction(sourceId: string): boolean {
    const result = this.cache.get(sourceId);
    return result?.hasDiffraction ?? false;
  }

  /**
   * Get all diffraction paths for a source.
   */
  getDiffractionPaths(sourceId: string): DiffractionPath[] {
    const result = this.cache.get(sourceId);
    return result?.paths ?? [];
  }
}
