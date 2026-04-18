import { AnimationTransitionSystem, type BonePose } from '../AnimationTransitions';

export interface MotionProbeSpec {
  entityId: string;
  duration: number;
  dt: number;
  sourcePose: BonePose[];
  targetRagdollPose: BonePose[];
  targetAnimPose: BonePose[];
}

export function runMotionDeterminismProbe(spec: MotionProbeSpec): Uint8Array {
  const transitionSystem = new AnimationTransitionSystem({
    duration: spec.duration,
    curve: 'ease_in_out',
  });

  transitionSystem.startAnimToRagdoll(spec.entityId, spec.sourcePose);

  const ragdollPoses = new Map<string, BonePose[]>([[spec.entityId, spec.targetRagdollPose]]);
  const animPoses = new Map<string, BonePose[]>([[spec.entityId, spec.targetAnimPose]]);

  const steps = Math.ceil(spec.duration / spec.dt);
  
  // 3 floats pos + 4 floats rot = 7 floats per bone per step
  const numBones = spec.sourcePose.length;
  const buffer = new Float32Array(steps * numBones * 7);
  let idx = 0;

  for (let i = 0; i < steps; i++) {
    const results = transitionSystem.update(spec.dt, ragdollPoses, animPoses);
    const blended = results.get(spec.entityId) || spec.sourcePose;

    for (const bone of blended) {
      buffer[idx++] = bone.position[0];
      buffer[idx++] = bone.position[1];
      buffer[idx++] = bone.position[2];
      buffer[idx++] = bone.rotation[0];
      buffer[idx++] = bone.rotation[1];
      buffer[idx++] = bone.rotation[2];
      buffer[idx++] = bone.rotation[3];
    }
  }

  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

export const PAPER_P2_MOTION_CANONICAL_SPEC: Readonly<MotionProbeSpec> = Object.freeze({
  entityId: 'test-entity',
  duration: 1.0,
  dt: 0.1,
  sourcePose: [
    { boneId: 'root', position: [0, 0, 0], rotation: [0, 0, 0, 1] },
    { boneId: 'arm', position: [1, 0, 0], rotation: [0, 0, 0, 1] },
  ],
  targetRagdollPose: [
    { boneId: 'root', position: [0, -1, 0], rotation: [0.707, 0, 0, 0.707] },
    { boneId: 'arm', position: [1, -1, 0], rotation: [0.707, 0, 0, 0.707] },
  ],
  targetAnimPose: [
    { boneId: 'root', position: [0, 1, 0], rotation: [0, 0.707, 0, 0.707] },
    { boneId: 'arm', position: [1, 1, 0], rotation: [0, 0.707, 0, 0.707] },
  ],
});
