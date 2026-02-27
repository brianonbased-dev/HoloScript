/**
 * animationBuilder.test.ts
 *
 * Unit tests for src/lib/animationBuilder.ts
 * Pure logic — no DOM, no Three.js mocks beyond basic class stubs.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  buildClipFromFrames,
  extractBuiltinAnimations,
} from '@/lib/animationBuilder';
import type { BoneFrame, RecordedClip } from '@/lib/animationBuilder';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBone(name: string): THREE.Bone {
  const b = new THREE.Bone();
  b.name = name;
  return b;
}

function makeSkeleton(boneNames: string[]): THREE.Skeleton {
  const bones = boneNames.map(makeBone);
  return new THREE.Skeleton(bones);
}

function identityFrame(time: number, boneIndex: number): BoneFrame {
  return { time, boneIndex, qx: 0, qy: 0, qz: 0, qw: 1 };
}

function movedFrame(time: number, boneIndex: number, qy = 0.5): BoneFrame {
  return { time, boneIndex, qx: 0, qy, qz: 0, qw: 0.866 };
}

// ── buildClipFromFrames ───────────────────────────────────────────────────────

describe('buildClipFromFrames', () => {
  let skeleton: THREE.Skeleton;

  beforeEach(() => {
    skeleton = makeSkeleton(['Hips', 'Spine', 'LeftArm', 'RightArm', 'Head']);
  });

  it('returns a THREE.AnimationClip', () => {
    const frames: BoneFrame[] = [
      movedFrame(0, 0), movedFrame(500, 0), movedFrame(1000, 0),
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    expect(clip).toBeInstanceOf(THREE.AnimationClip);
  });

  it('sets the clip name from the clipName argument', () => {
    // Use two distinct quaternions so bone is detected as moved
    const frames: BoneFrame[] = [
      { time: 0,    boneIndex: 0, qx: 0, qy: 0.5, qz: 0, qw: 0.866 },
      { time: 1000, boneIndex: 0, qx: 0, qy: 0.1, qz: 0, qw: 0.995 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000, 'Test Walk');
    expect(clip.name).toBe('Test Walk');
  });

  it('uses "Recorded Animation" as default clip name', () => {
    const frames: BoneFrame[] = [
      { time: 0,    boneIndex: 0, qx: 0, qy: 0.5, qz: 0, qw: 0.866 },
      { time: 1000, boneIndex: 0, qx: 0, qy: 0.1, qz: 0, qw: 0.995 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    expect(clip.name).toBe('Recorded Animation');
  });

  it('converts durationMs to seconds in clip.duration', () => {
    const frames: BoneFrame[] = [movedFrame(0, 1), movedFrame(2000, 1)];
    const clip = buildClipFromFrames(frames, skeleton, 2000);
    expect(clip.duration).toBe(2);
  });

  it('creates a QuaternionKeyframeTrack for bones that moved', () => {
    const frames: BoneFrame[] = [
      { time: 0,    boneIndex: 2, qx: 0, qy: 0.5, qz: 0, qw: 0.866 }, // moved
      { time: 500,  boneIndex: 2, qx: 0, qy: 0.3, qz: 0, qw: 0.954 },
      { time: 1000, boneIndex: 2, qx: 0, qy: 0.1, qz: 0, qw: 0.995 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    const track = clip.tracks.find((t) => t.name.includes('LeftArm'));
    expect(track).toBeDefined();
    expect(track).toBeInstanceOf(THREE.QuaternionKeyframeTrack);
  });

  it('track name follows Three.js bone animation convention: {BoneName}.quaternion', () => {
    const frames: BoneFrame[] = [
      { time: 0,    boneIndex: 0, qx: 0, qy: 0.5, qz: 0, qw: 0.866 },
      { time: 1000, boneIndex: 0, qx: 0, qy: 0.1, qz: 0, qw: 0.995 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    expect(clip.tracks[0].name).toBe('Hips.quaternion');
  });

  it('skips bones with only one frame', () => {
    const frames: BoneFrame[] = [movedFrame(0, 3)]; // only one frame for RightArm
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    const track = clip.tracks.find((t) => t.name.includes('RightArm'));
    expect(track).toBeUndefined();
  });

  it('skips static bones (no quaternion change)', () => {
    // All frames are identity (no movement)
    const frames: BoneFrame[] = [
      identityFrame(0, 0),
      identityFrame(500, 0),
      identityFrame(1000, 0),
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    // No tracks for static bone
    expect(clip.tracks).toHaveLength(0);
  });

  it('only includes bones that moved beyond the 0.001 threshold', () => {
    const frames: BoneFrame[] = [
      { time: 0,    boneIndex: 0, qx: 0, qy: 0.0005, qz: 0, qw: 1 },
      { time: 1000, boneIndex: 0, qx: 0, qy: 0.0005, qz: 0, qw: 1 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    expect(clip.tracks).toHaveLength(0);
  });

  it('includes multiple bones that moved', () => {
    const frames: BoneFrame[] = [
      // bone 0: qy changes from 0.5 to 0.1 → detected as moved
      { time: 0,    boneIndex: 0, qx: 0, qy: 0.5, qz: 0, qw: 0.866 },
      { time: 1000, boneIndex: 0, qx: 0, qy: 0.1, qz: 0, qw: 0.995 },
      // bone 1: changes from 0.5 to 0.3 → detected as moved
      movedFrame(0, 1),    movedFrame(1000, 1, 0.3),
      // bone 2: identity both frames → static, skipped
      identityFrame(0, 2), identityFrame(1000, 2),
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    expect(clip.tracks).toHaveLength(2);
  });

  it('converts frame times from ms to seconds in the track', () => {
    const frames: BoneFrame[] = [
      // Each frame must differ to trigger the 'moved' check
      { time: 0,    boneIndex: 0, qx: 0, qy: 0.6, qz: 0, qw: 0.8 },
      { time: 500,  boneIndex: 0, qx: 0, qy: 0.4, qz: 0, qw: 0.916 },
      { time: 1000, boneIndex: 0, qx: 0, qy: 0.1, qz: 0, qw: 0.995 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    const track = clip.tracks[0] as THREE.QuaternionKeyframeTrack;
    const times = Array.from(track.times);
    expect(times[0]).toBeCloseTo(0);
    expect(times[1]).toBeCloseTo(0.5);
    expect(times[2]).toBeCloseTo(1.0);
  });

  it('stores 4 values per keyframe (x, y, z, w quaternion)', () => {
    const frames: BoneFrame[] = [
      // First frame qy=0.5, second qy=0.7 — delta > 0.001
      { time: 0,   boneIndex: 0, qx: 0, qy: 0.5, qz: 0, qw: 0.866 },
      { time: 500, boneIndex: 0, qx: 0, qy: 0.7, qz: 0, qw: 0.714 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    const track = clip.tracks[0] as THREE.QuaternionKeyframeTrack;
    expect(track.values.length).toBe(8); // 2 keyframes × 4 components
  });

  it('handles an empty frames array gracefully', () => {
    const clip = buildClipFromFrames([], skeleton, 1000);
    expect(clip).toBeInstanceOf(THREE.AnimationClip);
    expect(clip.tracks).toHaveLength(0);
  });

  it('handles out-of-bounds bone index gracefully (no crash)', () => {
    const frames: BoneFrame[] = [
      movedFrame(0, 99),   // index 99 doesn't exist in 5-bone skeleton
      movedFrame(1000, 99),
    ];
    expect(() => buildClipFromFrames(frames, skeleton, 1000)).not.toThrow();
  });

  it('handles single-frame skeleton with moved bone — no track (need ≥2 frames to detect motion)', () => {
    const frames: BoneFrame[] = [movedFrame(500, 0)];
    const clip = buildClipFromFrames(frames, skeleton, 1000);
    expect(clip.tracks).toHaveLength(0);
  });

  it('handles very long recording (30s at 30fps = 900 frames per bone)', () => {
    const fps = 30;
    const durationMs = 30000;
    const frames: BoneFrame[] = [];
    for (let i = 0; i <= fps * 30; i++) {
      frames.push({
        time: i * (1000 / fps),
        boneIndex: 0,
        qx: Math.sin(i * 0.1) * 0.5,
        qy: 0,
        qz: 0,
        qw: Math.cos(i * 0.1) * 0.5,
      });
    }
    const clip = buildClipFromFrames(frames, skeleton, durationMs);
    expect(clip.tracks).toHaveLength(1);
    expect(clip.duration).toBe(30);
  });
});

// ── extractBuiltinAnimations ──────────────────────────────────────────────────

describe('extractBuiltinAnimations', () => {
  it('returns an empty array for empty animations list', () => {
    const result = extractBuiltinAnimations([]);
    expect(result).toEqual([]);
  });

  it('extracts name and duration from each clip', () => {
    const clips = [
      new THREE.AnimationClip('Idle', 2.5, []),
      new THREE.AnimationClip('Walk', 1.0, []),
      new THREE.AnimationClip('Run',  0.8, []),
    ];
    const result = extractBuiltinAnimations(clips);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'Idle', duration: 2500 });
    expect(result[1]).toEqual({ name: 'Walk', duration: 1000 });
    expect(result[2]).toEqual({ name: 'Run',  duration: 800 });
  });

  it('converts clip duration from seconds to milliseconds', () => {
    const clips = [new THREE.AnimationClip('Test', 3.14, [])];
    const result = extractBuiltinAnimations(clips);
    expect(result[0].duration).toBe(3140);
  });

  it('handles nameless clips by returning "Unnamed"', () => {
    // AnimationClip with empty string name
    const clip = new THREE.AnimationClip('', 1.0, []);
    const result = extractBuiltinAnimations([clip]);
    expect(result[0].name).toBe('Unnamed');
  });

  it('handles many clips (stress test)', () => {
    const clips = Array.from({ length: 50 }, (_, i) =>
      new THREE.AnimationClip(`Anim_${i}`, i * 0.1, [])
    );
    const result = extractBuiltinAnimations(clips);
    expect(result).toHaveLength(50);
    expect(result[10].name).toBe('Anim_10');
  });
});

// ── RecordedClip type guard (shape validation) ────────────────────────────────

describe('BoneFrame / RecordedClip type shapes', () => {
  it('BoneFrame has required fields', () => {
    const frame: BoneFrame = { time: 100, boneIndex: 0, qx: 0, qy: 0, qz: 0, qw: 1 };
    expect(frame.time).toBe(100);
    expect(frame.boneIndex).toBe(0);
    expect(frame.qw).toBe(1);
  });

  it('RecordedClip has required fields', () => {
    const clip: RecordedClip = {
      id: 'abc123',
      name: 'Test Take',
      duration: 3000,
      frames: [],
    };
    expect(clip.id).toBe('abc123');
    expect(clip.name).toBe('Test Take');
    expect(clip.duration).toBe(3000);
    expect(clip.frames).toEqual([]);
  });
});
