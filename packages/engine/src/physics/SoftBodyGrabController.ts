/**
 * SoftBodyGrabController
 *
 * Bridges the @grabbable trait to PBD attachment constraints.
 * When a hand grabs a soft body, finds the closest vertices within
 * a grab radius, creates attachment constraints with distance-weighted
 * compliance, and updates their targets each frame as the hand moves.
 */

import type { IVector3 } from './PhysicsTypes';
import type { PBDSolverCPU } from './PBDSolver';

// =============================================================================
// Types
// =============================================================================

interface GrabPoint {
  vertexIndex: number;
  /** Distance from grab origin at grab time (for compliance weighting) */
  grabDistance: number;
  /** Offset from hand position to this vertex at grab time */
  localOffset: IVector3;
}

interface ActiveGrab {
  handId: string;
  solver: PBDSolverCPU;
  grabPoints: GrabPoint[];
  /** Current hand position */
  handPosition: IVector3;
}

export interface GrabConfig {
  /** Maximum number of vertices to grab */
  maxVertices: number;
  /** Grab radius around the hand position */
  grabRadius: number;
  /** Base compliance for attachment (0 = hard, higher = softer) */
  baseCompliance: number;
  /** Compliance scales with distance: compliance = base * (1 + dist/radius * falloff) */
  complianceFalloff: number;
}

const DEFAULT_GRAB_CONFIG: GrabConfig = {
  maxVertices: 8,
  grabRadius: 0.15,
  baseCompliance: 0.001,
  complianceFalloff: 2.0,
};

// =============================================================================
// Controller
// =============================================================================

export class SoftBodyGrabController {
  private activeGrabs = new Map<string, ActiveGrab>();
  private config: GrabConfig;

  constructor(config?: Partial<GrabConfig>) {
    this.config = { ...DEFAULT_GRAB_CONFIG, ...config };
  }

  /**
   * Start grabbing the soft body at the given hand position.
   * Finds the closest vertices and creates attachment constraints.
   */
  grabStart(handId: string, handPosition: IVector3, solver: PBDSolverCPU): void {
    // Prevent double-grab from same hand
    if (this.activeGrabs.has(handId)) {
      this.grabEnd(handId);
    }

    const state = solver.getState();
    const positions = state.positions;
    const numVerts = positions.length / 3;
    const { grabRadius, maxVertices, baseCompliance, complianceFalloff } = this.config;
    const radiusSq = grabRadius * grabRadius;

    // Find vertices within grab radius, sorted by distance
    const candidates: Array<{ index: number; dist: number }> = [];
    for (let i = 0; i < numVerts; i++) {
      const dx = positions[i * 3] - handPosition.x;
      const dy = positions[i * 3 + 1] - handPosition.y;
      const dz = positions[i * 3 + 2] - handPosition.z;
      const distSq = dx * dx + dy * dy + dz * dz;
      if (distSq < radiusSq) {
        candidates.push({ index: i, dist: Math.sqrt(distSq) });
      }
    }

    if (candidates.length === 0) return;

    // Sort by distance, take closest N
    candidates.sort((a, b) => a.dist - b.dist);
    const selected = candidates.slice(0, maxVertices);

    const grabPoints: GrabPoint[] = [];
    for (const { index, dist } of selected) {
      // Compute local offset (vertex position relative to hand)
      const localOffset: IVector3 = {
        x: positions[index * 3] - handPosition.x,
        y: positions[index * 3 + 1] - handPosition.y,
        z: positions[index * 3 + 2] - handPosition.z,
      };

      // Compliance weighted by distance: closer = stiffer
      const distRatio = dist / grabRadius;
      const compliance = baseCompliance * (1 + distRatio * complianceFalloff);

      // Create attachment constraint with XPBD compliance for soft grab
      solver.pinVertex(
        index,
        {
          x: positions[index * 3],
          y: positions[index * 3 + 1],
          z: positions[index * 3 + 2],
        },
        compliance
      );

      grabPoints.push({ vertexIndex: index, grabDistance: dist, localOffset });
    }

    this.activeGrabs.set(handId, {
      handId,
      solver,
      grabPoints,
      handPosition: { ...handPosition },
    });
  }

  /**
   * Update grab target positions as the hand moves.
   * Each grabbed vertex follows the hand with its original local offset preserved.
   */
  grabUpdate(handId: string, handPosition: IVector3): void {
    const grab = this.activeGrabs.get(handId);
    if (!grab) return;

    grab.handPosition = { ...handPosition };

    for (const gp of grab.grabPoints) {
      const target: IVector3 = {
        x: handPosition.x + gp.localOffset.x,
        y: handPosition.y + gp.localOffset.y,
        z: handPosition.z + gp.localOffset.z,
      };
      grab.solver.updateAttachmentTarget(gp.vertexIndex, target);
    }
  }

  /**
   * Release the grab — remove all attachment constraints for this hand.
   */
  grabEnd(handId: string): void {
    const grab = this.activeGrabs.get(handId);
    if (!grab) return;

    for (const gp of grab.grabPoints) {
      grab.solver.unpinVertex(gp.vertexIndex);
    }
    this.activeGrabs.delete(handId);
  }

  /**
   * Check if a hand is currently grabbing.
   */
  isGrabbing(handId: string): boolean {
    return this.activeGrabs.has(handId);
  }

  /**
   * Get all active grab hand IDs.
   */
  getActiveGrabs(): string[] {
    return Array.from(this.activeGrabs.keys());
  }

  /**
   * Release all grabs (e.g., when soft body is destroyed).
   */
  releaseAll(): void {
    for (const handId of this.activeGrabs.keys()) {
      this.grabEnd(handId);
    }
  }
}
