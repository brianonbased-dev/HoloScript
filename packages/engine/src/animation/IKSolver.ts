/**
 * IKSolver.ts
 *
 * Inverse Kinematics: two-bone IK, CCD chain solver,
 * pole target, foot placement, and constraint limits.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface IKBone {
  id: string;
  position: [number, number, number];
  rotation: { x: number; y: number; z: number; w: number };
  length: number;
  minAngle?: number; // radians
  maxAngle?: number; // radians
}

export interface IKChain {
  id: string;
  bones: IKBone[];
  target: { x: number; y: number; z: number };
  poleTarget?: { x: number; y: number; z: number };
  weight: number; // 0-1 blend with original pose
  iterations: number;
}

export interface FootPlacementConfig {
  rayHeight: number;
  rayLength: number;
  footOffset: number;
  blendSpeed: number;
  enabled: boolean;
}

// =============================================================================
// IK SOLVER
// =============================================================================

export class IKSolver {
  private chains: Map<string, IKChain> = new Map();
  private footConfig: FootPlacementConfig = {
    rayHeight: 1,
    rayLength: 2,
    footOffset: 0.05,
    blendSpeed: 10,
    enabled: false,
  };
  private footPositions: Map<string, { x: number; y: number; z: number }> = new Map();

  // ---------------------------------------------------------------------------
  // Chain Management
  // ---------------------------------------------------------------------------

  addChain(chain: IKChain): void {
    this.chains.set(chain.id, chain);
  }
  removeChain(id: string): boolean {
    return this.chains.delete(id);
  }
  getChain(id: string): IKChain | undefined {
    return this.chains.get(id);
  }
  getChainCount(): number {
    return this.chains.size;
  }

  setTarget(chainId: string, x: number, y: number, z: number): void {
    const chain = this.chains.get(chainId);
    if (chain) chain.target = { x, y, z };
  }

  setPoleTarget(chainId: string, x: number, y: number, z: number): void {
    const chain = this.chains.get(chainId);
    if (chain) chain.poleTarget = { x, y, z };
  }

  setWeight(chainId: string, weight: number): void {
    const chain = this.chains.get(chainId);
    if (chain) chain.weight = Math.max(0, Math.min(1, weight));
  }

  // ---------------------------------------------------------------------------
  // Two-Bone IK
  // ---------------------------------------------------------------------------

  solveTwoBone(chainId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain || chain.bones.length < 2) return false;

    const root = chain.bones[0];
    const mid = chain.bones[1];
    const end = chain.bones.length > 2 ? chain.bones[2] : null;

    const a = root.length; // upper arm
    const b = mid.length; // forearm

    const target = chain.target;
    const dx = target.x - root.position.x;
    const dy = target.y - root.position.y;
    const dz = target.z - root.position.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    const dist = Math.sqrt(distSq);

    // Clamp to reachable range
    const maxReach = a + b;
    const minReach = Math.abs(a - b);
    const clampedDist = Math.max(minReach + 0.001, Math.min(maxReach - 0.001, dist));

    // Law of cosines for mid-bone angle
    const cosAngle = (a * a + b * b - clampedDist * clampedDist) / (2 * a * b);
    const _midAngle = Math.acos(Math.max(-1, Math.min(1, cosAngle)));

    // Root angle toward target
    const rootAngle = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz));

    // Apply angles (simplified 2D projection)
    const cosA = (a * a + clampedDist * clampedDist - b * b) / (2 * a * clampedDist);
    const rootBendAngle = Math.acos(Math.max(-1, Math.min(1, cosA)));

    const totalRootAngle = rootAngle + rootBendAngle * chain.weight;

    // Position mid bone
    mid.position = {
      x: root.position.x + Math.cos(totalRootAngle) * a * (dx / (dist || 1)),
      y: root.position.y + Math.sin(totalRootAngle) * a,
      z: root.position.z + Math.cos(totalRootAngle) * a * (dz / (dist || 1)),
    };

    // Position end bone (if exists)
    if (end) {
      const blendedTarget = {
        x: end.position.x + (target.x - end.position.x) * chain.weight,
        y: end.position.y + (target.y - end.position.y) * chain.weight,
        z: end.position.z + (target.z - end.position.z) * chain.weight,
      };
      end.position = blendedTarget;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // CCD (Cyclic Coordinate Descent)
  // ---------------------------------------------------------------------------

  solveCCD(chainId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain || chain.bones.length < 2) return false;

    const target = chain.target;
    const bones = chain.bones;

    for (let iter = 0; iter < chain.iterations; iter++) {
      for (let i = bones.length - 2; i >= 0; i--) {
        const bone = bones[i];
        const endEffector = bones[bones.length - 1];

        // Vector from bone to end effector
        const toEnd = {
          x: endEffector.position.x - bone.position.x,
          y: endEffector.position.y - bone.position.y,
          z: endEffector.position.z - bone.position.z,
        };

        // Vector from bone to target
        const toTarget = {
          x: target.x - bone.position.x,
          y: target.y - bone.position.y,
          z: target.z - bone.position.z,
        };

        // Compute rotation angle (2D simplification in XY plane)
        const angleEnd = Math.atan2(toEnd.y, toEnd.x);
        const angleTarget = Math.atan2(toTarget.y, toTarget.x);
        let angle = (angleTarget - angleEnd) * chain.weight;

        // Apply joint limits
        if (bone.minAngle !== undefined && bone.maxAngle !== undefined) {
          angle = Math.max(bone.minAngle, Math.min(bone.maxAngle, angle));
        }

        // Rotate all downstream bones
        const cosA = Math.cos(angle),
          sinA = Math.sin(angle);
        for (let j = i + 1; j < bones.length; j++) {
          const child = bones[j];
          const rx = child.position.x - bone.position.x;
          const ry = child.position.y - bone.position.y;
          child.position = {
            x: bone.position.x + rx * cosA - ry * sinA,
            y: bone.position.y + rx * sinA + ry * cosA,
            z: child.position.z,
          };
        }
      }

      // Check if close enough
      const end = bones[bones.length - 1];
      const dx = end.position.x - target.x;
      const dy = end.position.y - target.y;
      const dz = end.position.z - target.z;
      if (dx * dx + dy * dy + dz * dz < 0.001) return true;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Foot Placement
  // ---------------------------------------------------------------------------

  setFootPlacement(config: Partial<FootPlacementConfig>): void {
    Object.assign(this.footConfig, config);
  }

  getFootPlacement(): FootPlacementConfig {
    return { ...this.footConfig };
  }

  updateFootPlacement(
    footId: string,
    groundHeight: number,
    dt: number
  ): { x: number; y: number; z: number } {
    const current = this.footPositions.get(footId) ?? { x: 0, y: 0, z: 0 };
    const targetY = groundHeight + this.footConfig.footOffset;
    const blend = Math.min(1, this.footConfig.blendSpeed * dt);

    const result = {
      x: current.x,
      y: current.y + (targetY - current.y) * blend,
      z: current.z,
    };

    this.footPositions.set(footId, result);
    return result;
  }

  // ---------------------------------------------------------------------------
  // Solve All
  // ---------------------------------------------------------------------------

  solveAll(): void {
    for (const chain of this.chains.values()) {
      if (chain.bones.length === 2 || chain.bones.length === 3) {
        this.solveTwoBone(chain.id);
      } else {
        this.solveCCD(chain.id);
      }
    }
  }
}
