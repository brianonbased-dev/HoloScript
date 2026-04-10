/**
 * AnimationTransitions.ts
 *
 * Ragdoll ? Animation blending system.
 * Enables seamless transitions between physics-driven ragdoll and keyframed animation.
 *
 * @module animation
 */

export interface IVector3 {
  x: number;
  y: number;
  z: number;
}

export interface BonePose {
  boneId: string;
  position: IVector3;
  rotation: { x: number; y: number; z: number; w: number };
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

  startAnimToRagdoll(entityId: string, currentPose: BonePose[]): void {
    this.activeBlends.set(entityId, {
      direction: 'animation_to_ragdoll',
      progress: 0,
      duration: this.config.duration,
      sourcePose: currentPose.map((p) => ({
        ...p,
        position: { ...p.position },
        rotation: { ...p.rotation },
      })),
      isComplete: false,
    });
  }

  startRagdollToAnim(entityId: string, currentPose: BonePose[]): void {
    this.activeBlends.set(entityId, {
      direction: 'ragdoll_to_animation',
      progress: 0,
      duration: this.config.duration,
      sourcePose: currentPose.map((p) => ({
        ...p,
        position: { ...p.position },
        rotation: { ...p.rotation },
      })),
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
          position: this.lerpVec3(fromBone.position, toBone.position, t),
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
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
      z: a.z + (b.z - a.z) * t,
    };
  }

  private slerpQuat(
    a: { x: number; y: number; z: number; w: number },
    b: { x: number; y: number; z: number; w: number },
    t: number
  ): { x: number; y: number; z: number; w: number } {
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bx = b.x,
      by = b.y,
      bz = b.z,
      bw = b.w;
    if (dot < 0) {
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
      dot = -dot;
    }

    const rx = a.x + (bx - a.x) * t;
    const ry = a.y + (by - a.y) * t;
    const rz = a.z + (bz - a.z) * t;
    const rw = a.w + (bw - a.w) * t;
    const len = Math.sqrt(rx * rx + ry * ry + rz * rz + rw * rw) || 1;
    return { x: rx / len, y: ry / len, z: rz / len, w: rw / len };
  }
}
