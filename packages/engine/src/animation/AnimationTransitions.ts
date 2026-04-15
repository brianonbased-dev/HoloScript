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
  rotation: [number, number, number, number];
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

  private normalizePose(pose: BonePose[]): BonePose[] {
    return pose.map((p) => ({
      ...p,
      position: this.toVec3(p.position as IVector3 | { x: number; y: number; z: number }),
      rotation: [...p.rotation] as [number, number, number, number],
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
    a: [number, number, number, number],
    b: [number, number, number, number],
    t: number
  ): [number, number, number, number] {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    let bx = b[0],
      by = b[1],
      bz = b[2],
      bw = b[3];
    if (dot < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
      dot = -dot;
    }

    const rx = a[0] + (bx - a[0]) * t;
    const ry = a[1] + (by - a[1]) * t;
    const rz = a[2] + (bz - a[2]) * t;
    const rw = a[3] + (bw - a[3]) * t;
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1;
    return [rx / len, ry / len, rz / len, rw / len];
  }
}
