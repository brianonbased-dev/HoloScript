/** Local tuple type for IK positions — avoids coupling to @holoscript/core object-style Vector3. */
type Vec3 = [number, number, number];
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
  position: Vec3;
  rotation: { x: number; y: number; z: number; w: number };
  length: number;
  minAngle?: number; // radians
  maxAngle?: number; // radians
}

export interface IKChain {
  id: string;
  bones: IKBone[];
  target: Vec3;
  poleTarget?: Vec3;
  weight: number; // 0-1 blend with original pose
  iterations: number;
}

export type IKSolveMode = 'analytic' | 'ccd' | 'fabrik';

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
  private footPositions: Map<string, Vec3> = new Map();

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
    if (chain) chain.target = [x, y, z];
  }

  setPoleTarget(chainId: string, x: number, y: number, z: number): void {
    const chain = this.chains.get(chainId);
    if (chain) chain.poleTarget = [x, y, z];
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
    const dx = target[0] - root.position[0];
    const dy = target[1] - root.position[1];
    const dz = target[2] - root.position[2];
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
    mid.position = [
      root.position[0] + Math.cos(totalRootAngle) * a * (dx / (dist || 1)),
      root.position[1] + Math.sin(totalRootAngle) * a,
      root.position[2] + Math.cos(totalRootAngle) * a * (dz / (dist || 1))
    ];

    // Position end bone (if exists)
    if (end) {
      const blendedTarget: Vec3 = [
        end.position[0] + (target[0] - end.position[0]) * chain.weight,
        end.position[1] + (target[1] - end.position[1]) * chain.weight,
        end.position[2] + (target[2] - end.position[2]) * chain.weight
      ];
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
        const toEnd = [
          endEffector.position[0] - bone.position[0],
          endEffector.position[1] - bone.position[1],
          endEffector.position[2] - bone.position[2]
        ];

        // Vector from bone to target
        const toTarget = [
          target[0] - bone.position[0],
          target[1] - bone.position[1],
          target[2] - bone.position[2]
        ];

        // Compute rotation angle (2D simplification in XY plane)
        const angleEnd = Math.atan2(toEnd[1], toEnd[0]);
        const angleTarget = Math.atan2(toTarget[1], toTarget[0]);
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
          const rx = child.position[0] - bone.position[0];
          const ry = child.position[1] - bone.position[1];
          child.position = [
            bone.position[0] + rx * cosA - ry * sinA,
            bone.position[1] + rx * sinA + ry * cosA,
            child.position[2]
          ];
        }
      }

      // Check if close enough
      const end = bones[bones.length - 1];
      const dx = end.position[0] - target[0];
      const dy = end.position[1] - target[1];
      const dz = end.position[2] - target[2];
      if (dx * dx + dy * dy + dz * dz < 0.001) return true;
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // FABRIK (Forward And Backward Reaching Inverse Kinematics)
  // ---------------------------------------------------------------------------

  solveFABRIK(chainId: string): boolean {
    const chain = this.chains.get(chainId);
    if (!chain || chain.bones.length < 2) return false;

    const bones = chain.bones;
    const target = chain.target;
    const rootOrigin: Vec3 = [
      bones[0].position[0],
      bones[0].position[1],
      bones[0].position[2],
    ];

    const segmentLengths: number[] = [];
    let totalLength = 0;
    for (let i = 0; i < bones.length - 1; i += 1) {
      const len = Math.max(1e-6, bones[i].length);
      segmentLengths.push(len);
      totalLength += len;
    }

    const targetDx = target[0] - rootOrigin[0];
    const targetDy = target[1] - rootOrigin[1];
    const targetDz = target[2] - rootOrigin[2];
    const rootToTarget = Math.sqrt(targetDx * targetDx + targetDy * targetDy + targetDz * targetDz);

    if (rootToTarget >= totalLength) {
      // Unreachable: stretch the chain along the root→target ray.
      for (let i = 0; i < bones.length - 1; i += 1) {
        const base = bones[i].position;
        const dx = target[0] - base[0];
        const dy = target[1] - base[1];
        const dz = target[2] - base[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const scale = segmentLengths[i] / dist;
        bones[i + 1].position = [
          base[0] + dx * scale,
          base[1] + dy * scale,
          base[2] + dz * scale,
        ];
      }
      return true;
    }

    const toleranceSq = 1e-6;
    for (let iter = 0; iter < chain.iterations; iter += 1) {
      // Forward reaching: pin end effector to target and walk backward.
      bones[bones.length - 1].position = [target[0], target[1], target[2]];
      for (let i = bones.length - 2; i >= 0; i -= 1) {
        const child = bones[i + 1];
        const current = bones[i];
        const dx = current.position[0] - child.position[0];
        const dy = current.position[1] - child.position[1];
        const dz = current.position[2] - child.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const scale = segmentLengths[i] / dist;
        current.position = [
          child.position[0] + dx * scale,
          child.position[1] + dy * scale,
          child.position[2] + dz * scale,
        ];
      }

      // Backward reaching: re-pin root to origin and walk forward.
      bones[0].position = [rootOrigin[0], rootOrigin[1], rootOrigin[2]];
      for (let i = 0; i < bones.length - 1; i += 1) {
        const parent = bones[i];
        const child = bones[i + 1];
        const dx = child.position[0] - parent.position[0];
        const dy = child.position[1] - parent.position[1];
        const dz = child.position[2] - parent.position[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        const scale = segmentLengths[i] / dist;
        child.position = [
          parent.position[0] + dx * scale,
          parent.position[1] + dy * scale,
          parent.position[2] + dz * scale,
        ];
      }

      const end = bones[bones.length - 1].position;
      const errX = end[0] - target[0];
      const errY = end[1] - target[1];
      const errZ = end[2] - target[2];
      if (errX * errX + errY * errY + errZ * errZ <= toleranceSq) {
        break;
      }
    }

    return true;
  }

  solveChain(chainId: string, mode: IKSolveMode): boolean {
    switch (mode) {
      case 'analytic':
        return this.solveTwoBone(chainId);
      case 'ccd':
        return this.solveCCD(chainId);
      case 'fabrik':
        return this.solveFABRIK(chainId);
      default:
        return false;
    }
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
  ): Vec3 {
    const current = this.footPositions.get(footId) ?? [0, 0, 0];
    const targetY = groundHeight + this.footConfig.footOffset;
    const blend = Math.min(1, this.footConfig.blendSpeed * dt);

    const result: Vec3 = [current[0], current[1] + (targetY - current[1]) * blend, current[2]];
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
