/**
 * animationBuilder.ts
 *
 * Converts raw recorded bone frames → THREE.AnimationClip
 * for playback via THREE.AnimationMixer.
 */

import * as THREE from 'three';

export interface BoneFrame {
  /** milliseconds since recording start */
  time: number;
  /** index into skeleton.bones[] */
  boneIndex: number;
  /** Quaternion — supports both object notation (qx, qy, qz, qw) and tuple notation (rotation) */
  qx?: number;
  qy?: number;
  qz?: number;
  qw?: number;
  rotation?: [number, number, number, number]; // [x, y, z, w] (legacy tuple notation)
}

export interface RecordedClip {
  id: string;
  name: string;
  /** ms */
  duration: number;
  frames: BoneFrame[];
}

/**
 * Build a THREE.AnimationClip from recorded BoneFrames.
 * Only bones that actually moved are included as tracks.
 *
 * @param frames   Raw recorded frames (from useFrame sampler)
 * @param skeleton THREE.Skeleton from the loaded GLB
 * @param durationMs Total recording duration in milliseconds
 */
export function buildClipFromFrames(
  frames: BoneFrame[],
  skeleton: THREE.Skeleton,
  durationMs: number,
  clipName = 'Recorded Animation'
): THREE.AnimationClip {
  const durationSec = durationMs / 1000;

  // Group frames by bone index
  const byBone = new Map<number, BoneFrame[]>();
  for (const f of frames) {
    if (!byBone.has(f.boneIndex)) byBone.set(f.boneIndex, []);
    byBone.get(f.boneIndex)!.push(f);
  }

  const tracks: THREE.KeyframeTrack[] = [];

  byBone.forEach((boneFrames, boneIndex) => {
    const bone = skeleton.bones[boneIndex];
    if (!bone) return;

    // Check if bone actually moved (skip static bones to save memory)
    if (boneFrames.length < 2) return;
    const first = boneFrames[0];
    
    // Support both quaternion access patterns: { qx, qy, qz, qw } and { rotation: [...] }
    const getQuat = (f: BoneFrame) => [
      f.qx ?? (f.rotation?.[0] ?? 0),
      f.qy ?? (f.rotation?.[1] ?? 0),
      f.qz ?? (f.rotation?.[2] ?? 0),
      f.qw ?? (f.rotation?.[3] ?? 1),
    ];
    
    const firstQuat = getQuat(first);
    const moved = boneFrames.some((f) => {
      const q = getQuat(f);
      return (
        Math.abs(q[0] - firstQuat[0]) > 0.001 ||
        Math.abs(q[1] - firstQuat[1]) > 0.001 ||
        Math.abs(q[2] - firstQuat[2]) > 0.001 ||
        Math.abs(q[3] - firstQuat[3]) > 0.001
      );
    });
    if (!moved) return;

    const times = boneFrames.map((f) => f.time / 1000);
    const values: number[] = [];
    for (const f of boneFrames) {
      const q = getQuat(f);
      values.push(...q);
    }

    // Track name matches Three.js bone animation naming convention
    const trackName = `${bone.name}.quaternion`;
    tracks.push(new THREE.QuaternionKeyframeTrack(trackName, times, values));
  });

  return new THREE.AnimationClip(clipName, durationSec, tracks);
}

/**
 * Given a GLTFLoader result, extract built-in animations as a summary list.
 */
export function extractBuiltinAnimations(
  animations: THREE.AnimationClip[]
): Array<{ name: string; duration: number }> {
  return animations.map((clip) => ({
    name: clip.name || 'Unnamed',
    duration: Math.round(clip.duration * 1000), // convert to ms
  }));
}
