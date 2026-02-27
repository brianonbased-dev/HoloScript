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
  qx: number;
  qy: number;
  qz: number;
  qw: number;
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
  clipName = 'Recorded Animation',
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
    const moved = boneFrames.some(
      (f) =>
        Math.abs(f.qx - first.qx) > 0.001 ||
        Math.abs(f.qy - first.qy) > 0.001 ||
        Math.abs(f.qz - first.qz) > 0.001 ||
        Math.abs(f.qw - first.qw) > 0.001,
    );
    if (!moved) return;

    const times = boneFrames.map((f) => f.time / 1000);
    const values: number[] = [];
    for (const f of boneFrames) {
      values.push(f.qx, f.qy, f.qz, f.qw);
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
  animations: THREE.AnimationClip[],
): Array<{ name: string; duration: number }> {
  return animations.map((clip) => ({
    name: clip.name || 'Unnamed',
    duration: Math.round(clip.duration * 1000), // convert to ms
  }));
}
