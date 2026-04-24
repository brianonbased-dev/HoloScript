import type { Vector3 } from '@holoscript/core';
/**
 * AnimationTransitions.ts
 *
 * Ragdoll ? Animation blending system.
 * Enables seamless transitions between physics-driven ragdoll and keyframed animation.
 *
 * @module animation
 */

export type IVector3 = [number, number, number];

export interface BonePose {
  boneId: string;
  position: IVector3;
  rotation: [number, number, number, number] & { x: number; y: number; z: number; w: number };
}

export interface TransitionConfig {
  duration: number;
  curve: 'linear' | 'ease_in' | 'ease_out' | 'ease_in_out';
  settleThreshold: number;
}

export type TransitionDirection = 'animation_to_ragdoll' | 'ragdoll_to_animation';

export interface BlendState {
  direction: TransitionDirection;
  progress: number;
  duration: number;
  sourcePose: BonePose[];
  isComplete: boolean;
}

const DEFAULT_CONFIG: TransitionConfig = {
  duration: 0.5,
  curve: 'ease_in_out',
  settleThreshold: 0.1,
};

export class AnimationTransitionSystem {
  private config: TransitionConfig;
  private activeBlends: Map<string, BlendState> = new Map();

  constructor(config: Partial<TransitionConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Normalize position: supports [x,y,z] arrays and {x,y,z} objects */
  private toVec3(v: IVector3 | { x: number; y: number; z: number }): IVector3 {
    if (Array.isArray(v)) return [v[0], v[1], v[2]];
    return [(v as { x: number; y: number; z: number }).x ?? 0,
            (v as { x: number; y: number; z: number }).y ?? 0,
            (v as { x: number; y: number; z: number }).z ?? 0];
  }

  private toQuat4(
    q:
      | ([number, number, number, number] & Partial<{ x: number; y: number; z: number; w: number }>)
      | { x: number; y: number; z: number; w: number }
  ): [number, number, number, number] & { x: number; y: number; z: number; w: number } {
    const x = Array.isArray(q) ? (q[0] ?? 0) : (q.x ?? 0);
    const y = Array.isArray(q) ? (q[1] ?? 0) : (q.y ?? 0);
    const z = Array.isArray(q) ? (q[2] ?? 0) : (q.z ?? 0);
    const w = Array.isArray(q) ? (q[3] ?? 1) : (q.w ?? 1);
    const out = [x, y, z, w] as [number, number, number, number] & {
      x: number;
      y: number;
      z: number;
      w: number;
    };
    Object.defineProperty(out, 'x', { value: x, enumerable: false });
    Object.defineProperty(out, 'y', { value: y, enumerable: false });
    Object.defineProperty(out, 'z', { value: z, enumerable: false });
    Object.defineProperty(out, 'w', { value: w, enumerable: false });
    return out;
  }

  private normalizePose(pose: BonePose[]): BonePose[] {
    return pose.map((p) => ({
      ...p,
      position: this.toVec3(p.position as IVector3 | { x: number; y: number; z: number }),
      rotation: this.toQuat4(
        p.rotation as
          | ([number, number, number, number] & Partial<{ x: number; y: number; z: number; w: number }>)
          | { x: number; y: number; z: number; w: number }
      ),
    }));
  }

  startAnimToRagdoll(entityId: string, currentPose: BonePose[]): void {
    this.activeBlends.set(entityId, {
      direction: 'animation_to_ragdoll',
      progress: 0,
      duration: this.config.duration,
      sourcePose: this.normalizePose(currentPose),
      isComplete: false,
    });
  }

  startRagdollToAnim(entityId: string, currentPose: BonePose[]): void {
    this.activeBlends.set(entityId, {
      direction: 'ragdoll_to_animation',
      progress: 0,
      duration: this.config.duration,
      sourcePose: this.normalizePose(currentPose),
      isComplete: false,
    });
  }

  update(
    dt: number,
    ragdollPoses: Map<string, BonePose[]>,
    animPoses: Map<string, BonePose[]>
  ): Map<string, BonePose[]> {
    const results = new Map<string, BonePose[]>();

    for (const [entityId, blend] of this.activeBlends) {
      if (blend.isComplete) continue;

      blend.progress = Math.min(1, blend.progress + dt / blend.duration);
      const t = this.applyCurve(blend.progress);

      const ragdoll = ragdollPoses.get(entityId) || blend.sourcePose;
      const anim = animPoses.get(entityId) || blend.sourcePose;
      const blended: BonePose[] = [];

      for (let i = 0; i < blend.sourcePose.length; i++) {
        const source = blend.sourcePose[i];
        const ragBone = ragdoll.find((b) => b.boneId === source.boneId) || source;
        const animBone = anim.find((b) => b.boneId === source.boneId) || source;
        const fromBone = blend.direction === 'animation_to_ragdoll' ? animBone : ragBone;
        const toBone = blend.direction === 'animation_to_ragdoll' ? ragBone : animBone;

        blended.push({
          boneId: source.boneId,
          position: this.lerpVec3(
            this.toVec3(fromBone.position as IVector3 | { x: number; y: number; z: number }),
            this.toVec3(toBone.position as IVector3 | { x: number; y: number; z: number }),
            t
          ),
          rotation: this.slerpQuat(fromBone.rotation, toBone.rotation, t),
        });
      }

      results.set(entityId, blended);

      if (blend.progress >= 1) {
        blend.isComplete = true;
      }
    }

    return results;
  }

  isTransitioning(entityId: string): boolean {
    const blend = this.activeBlends.get(entityId);
    return blend !== undefined && !blend.isComplete;
  }

  getBlendProgress(entityId: string): number {
    return this.activeBlends.get(entityId)?.progress ?? 0;
  }

  clearTransition(entityId: string): void {
    this.activeBlends.delete(entityId);
  }

  getActiveTransitionCount(): number {
    let count = 0;
    for (const [, blend] of this.activeBlends) {
      if (!blend.isComplete) count++;
    }
    return count;
  }

  private applyCurve(t: number): number {
    switch (this.config.curve) {
      case 'ease_in':
        return t * t;
      case 'ease_out':
        return 1 - (1 - t) * (1 - t);
      case 'ease_in_out':
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      case 'linear':
      default:
        return t;
    }
  }

  private lerpVec3(a: IVector3, b: IVector3, t: number): IVector3 {
    return [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];
  }

  private slerpQuat(
    a: [number, number, number, number] & Partial<{ x: number; y: number; z: number; w: number }>,
    b: [number, number, number, number] & Partial<{ x: number; y: number; z: number; w: number }>,
    t: number
  ): [number, number, number, number] & { x: number; y: number; z: number; w: number } {
    const aq = this.toQuat4(a);
    const bq = this.toQuat4(b);

    let dot = aq[0] * bq[0] + aq[1] * bq[1] + aq[2] * bq[2] + aq[3] * bq[3];
    let bx = bq[0],
      by = bq[1],
      bz = bq[2],
      bw = bq[3];
    if (dot < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
      dot = -dot;
    }

    const rx = aq[0] + (bx - aq[0]) * t;
    const ry = aq[1] + (by - aq[1]) * t;
    const rz = aq[2] + (bz - aq[2]) * t;
    const rw = aq[3] + (bw - aq[3]) * t;
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1;
    return this.toQuat4([rx / len, ry / len, rz / len, rw / len]);
  }
}
