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
  point1: { x: number; y: number; z: number };
  point2: { x: number; y: number; z: number };
  obstacleId?: string; // Optional reference to obstacle
}

export interface DiffractionPath {
  edgeId: string;
  diffractionPoint: { x: number; y: number; z: number };
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
  sourcePos: { x: number; y: number; z: number },
  listenerPos: { x: number; y: number; z: number }
) => DiffractionEdge[];

/**
 * Provider function to check line-of-sight between two points.
 * Returns true if the path is clear, false if obstructed.
 */
export type LineOfSightProvider = (
  point1: { x: number; y: number; z: number },
  point2: { x: number; y: number; z: number }
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
    sourcePos: { x: number; y: number; z: number },
    listenerPos: { x: number; y: number; z: number },
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
    sourcePos: { x: number; y: number; z: number },
    listenerPos: { x: number; y: number; z: number }
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
    sourcePos: { x: number; y: number; z: number },
    listenerPos: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    // Simplified: use midpoint of source and listener projected onto edge
    const midpoint = {
      x: (sourcePos.x + listenerPos.x) / 2,
      y: (sourcePos.y + listenerPos.y) / 2,
      z: (sourcePos.z + listenerPos.z) / 2,
    };

    return this.closestPointOnSegment(edge.point1, edge.point2, midpoint);
  }

  /**
   * Calculate the diffraction angle in radians.
   * This is the angle between source->edge and edge->listener vectors.
   */
  private calculateDiffractionAngle(
    sourcePos: { x: number; y: number; z: number },
    edgePoint: { x: number; y: number; z: number },
    listenerPos: { x: number; y: number; z: number }
  ): number {
    // Vector from edge to source
    const v1 = {
      x: sourcePos.x - edgePoint.x,
      y: sourcePos.y - edgePoint.y,
      z: sourcePos.z - edgePoint.z,
    };

    // Vector from edge to listener
    const v2 = {
      x: listenerPos.x - edgePoint.x,
      y: listenerPos.y - edgePoint.y,
      z: listenerPos.z - edgePoint.z,
    };

    // Normalize
    const len1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y + v1.z * v1.z);
    const len2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y + v2.z * v2.z);

    if (len1 === 0 || len2 === 0) return 0;

    v1.x /= len1;
    v1.y /= len1;
    v1.z /= len1;
    v2.x /= len2;
    v2.y /= len2;
    v2.z /= len2;

    // Dot product
    const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

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
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number }
  ): number {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dz = p2.z - p1.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Find closest point on line segment AB to point P.
   */
  private closestPointOnSegment(
    a: { x: number; y: number; z: number },
    b: { x: number; y: number; z: number },
    p: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    const ab = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const ap = { x: p.x - a.x, y: p.y - a.y, z: p.z - a.z };

    const abLenSq = ab.x * ab.x + ab.y * ab.y + ab.z * ab.z;

    if (abLenSq === 0) return { ...a }; // A and B are the same point

    const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y + ap.z * ab.z) / abLenSq));

    return {
      x: a.x + t * ab.x,
      y: a.y + t * ab.y,
      z: a.z + t * ab.z,
    };
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
