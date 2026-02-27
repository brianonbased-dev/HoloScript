/**
 * animator.scenario.ts — LIVING-SPEC: Animator (with easing + buildClipFromFrames)
 *
 * Persona: Marco — character animator rigging and keyframing characters in HoloScript Studio.
 *
 * ✓ it(...)      = PASSING — feature exists
 * ⊡ it.todo(...) = SKIPPED — missing feature (backlog item)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useCharacterStore } from '@/lib/store';
import { extractBuiltinAnimations, buildClipFromFrames, type BoneFrame, type RecordedClip } from '@/lib/animationBuilder';
import type { Keyframe, AnimTrack } from '@/hooks/useKeyframes';
import {
  easeInCubic, easeOutCubic, easeInOutCubic,
  easeInQuad, easeOutQuad,
  easeInSine, easeOutSine, easeInOutSine,
  easeInBack, easeOutBack,
  easeOutBounce, easeInElastic, easeOutElastic,
  easeInExpo, easeOutExpo,
  cubicBezier, CSS_EASE, CSS_EASE_IN, CSS_EASE_OUT, CSS_EASE_IN_OUT,
  applyEasing, evaluateTrackWithEasing, insertKeyframeSorted,
  linear,
} from '@/lib/curveEasing';
import * as THREE from 'three';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function evaluateTrack(track: AnimTrack, currentTime: number): number | null {
  const kfs = track.keyframes;
  if (kfs.length === 0) return null;
  if (currentTime <= kfs[0]!.time) return kfs[0]!.value;
  if (currentTime >= kfs[kfs.length - 1]!.time) return kfs[kfs.length - 1]!.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i]!; const b = kfs[i + 1]!;
    if (currentTime >= a.time && currentTime <= b.time) {
      const t = (currentTime - a.time) / (b.time - a.time);
      return a.value + (b.value - a.value) * t;
    }
  }
  return null;
}

function makeKF(id: string, time: number, value: number, easing: Keyframe['easing'] = 'linear'): Keyframe {
  return { id, track: 'default', time, value, easing };
}
function makeTrack(id: string, keyframes: Keyframe[]): AnimTrack {
  return { id, sceneId: 'test', name: 'Track', property: 'position.x', objectName: 'Cube', keyframes };
}
function makeBoneFrame(boneIndex: number, time: number, q: [number,number,number,number]): BoneFrame {
  return { time, boneIndex, qx: q[0], qy: q[1], qz: q[2], qw: q[3] };
}
function makeRecordedClip(id: string, frames: BoneFrame[], duration = 2000): RecordedClip {
  return { id, name: `Clip ${id}`, duration, frames };
}

// ═══════════════════════════════════════════════════════════════════
// 1. Character Store
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animator — Character Store', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      glbUrl: null, boneNames: [], selectedBoneIndex: null,
      showSkeleton: true, isRecording: false,
      recordedClips: [], activeClipId: null,
      builtinAnimations: [], activeBuiltinAnimation: null,
    });
  });

  it('starts with no character loaded (glbUrl is null)', () => expect(useCharacterStore.getState().glbUrl).toBeNull());

  it('setGlbUrl() stores the URL and resets skeleton state', () => {
    useCharacterStore.setState({ boneNames: ['Hip', 'Spine'], selectedBoneIndex: 2 });
    useCharacterStore.getState().setGlbUrl('blob:test-url');
    const s = useCharacterStore.getState();
    expect(s.glbUrl).toBe('blob:test-url');
    expect(s.boneNames).toHaveLength(0);
    expect(s.selectedBoneIndex).toBeNull();
  });

  it('setGlbUrl(null) clears the character', () => {
    useCharacterStore.getState().setGlbUrl('blob:something');
    useCharacterStore.getState().setGlbUrl(null);
    expect(useCharacterStore.getState().glbUrl).toBeNull();
  });

  it('setBoneNames() stores the skeleton bone list', () => {
    useCharacterStore.getState().setBoneNames(['Hip', 'Spine', 'Chest', 'Head']);
    expect(useCharacterStore.getState().boneNames).toHaveLength(4);
  });

  it('setSelectedBoneIndex() selects a bone', () => {
    useCharacterStore.getState().setSelectedBoneIndex(1);
    expect(useCharacterStore.getState().selectedBoneIndex).toBe(1);
  });

  it('setShowSkeleton(false) hides the skeleton overlay', () => {
    useCharacterStore.getState().setShowSkeleton(false);
    expect(useCharacterStore.getState().showSkeleton).toBe(false);
  });

  it('setBuiltinAnimations() stores animation summary list', () => {
    useCharacterStore.getState().setBuiltinAnimations([{ name: 'Walk', duration: 1200 }]);
    expect(useCharacterStore.getState().builtinAnimations[0].name).toBe('Walk');
  });

  it.todo('drag-and-drop .glb onto viewport triggers setGlbUrl()');
  it.todo('bone list renders in SkeletonPanel with expandable hierarchy');
  it.todo('character auto-poses to T-pose on load');
});

// ═══════════════════════════════════════════════════════════════════
// 2. Clip Recording
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animator — Clip Recording', () => {
  beforeEach(() => {
    useCharacterStore.setState({
      glbUrl: 'blob:char', boneNames: ['Hip', 'Arm'],
      selectedBoneIndex: null, showSkeleton: true,
      isRecording: false, recordedClips: [], activeClipId: null,
      builtinAnimations: [], activeBuiltinAnimation: null,
    });
  });

  it('addRecordedClip() appends a clip', () => {
    useCharacterStore.getState().addRecordedClip(makeRecordedClip('c1', []));
    expect(useCharacterStore.getState().recordedClips).toHaveLength(1);
  });

  it('addRecordedClip() accumulates multiple clips', () => {
    for (let i = 0; i < 3; i++) useCharacterStore.getState().addRecordedClip(makeRecordedClip(`c${i}`, []));
    expect(useCharacterStore.getState().recordedClips).toHaveLength(3);
  });

  it('removeRecordedClip() removes the correct clip', () => {
    useCharacterStore.getState().addRecordedClip(makeRecordedClip('keep', []));
    useCharacterStore.getState().addRecordedClip(makeRecordedClip('del', []));
    useCharacterStore.getState().removeRecordedClip('del');
    expect(useCharacterStore.getState().recordedClips.map(c => c.id)).toContain('keep');
    expect(useCharacterStore.getState().recordedClips.map(c => c.id)).not.toContain('del');
  });

  it('renameRecordedClip() updates the clip name', () => {
    useCharacterStore.getState().addRecordedClip(makeRecordedClip('c1', []));
    useCharacterStore.getState().renameRecordedClip('c1', 'Punch L');
    expect(useCharacterStore.getState().recordedClips[0].name).toBe('Punch L');
  });

  it('setActiveClipId() sets the playing clip', () => {
    useCharacterStore.getState().addRecordedClip(makeRecordedClip('c1', []));
    useCharacterStore.getState().setActiveClipId('c1');
    expect(useCharacterStore.getState().activeClipId).toBe('c1');
  });

  it.todo('record button starts sampling BoneFrames at 60fps');
  it.todo('ClipLibrary panel lists all clips with duration badge');
});

// ═══════════════════════════════════════════════════════════════════
// 3. Animation Builder — Pure Logic + Three.js mock
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animator — Animation Builder', () => {
  it('extractBuiltinAnimations() maps clip name and duration (ms)', () => {
    const result = extractBuiltinAnimations([{ name: 'Walk', duration: 1.2 }] as any);
    expect(result[0]).toEqual({ name: 'Walk', duration: 1200 });
  });

  it('extractBuiltinAnimations() uses "Unnamed" for empty name', () => {
    expect(extractBuiltinAnimations([{ name: '', duration: 0.8 }] as any)[0]!.name).toBe('Unnamed');
  });

  it('extractBuiltinAnimations() on empty array returns empty', () => {
    expect(extractBuiltinAnimations([])).toHaveLength(0);
  });

  it('buildClipFromFrames() produces a THREE.AnimationClip with correct name', () => {
    const bone = new THREE.Bone();
    bone.name = 'Hip';
    const skeleton = new THREE.Skeleton([bone]);
    const frames: BoneFrame[] = [
      { time: 0,   boneIndex: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      { time: 500, boneIndex: 0, qx: 0.1, qy: 0, qz: 0, qw: 0.995 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 500, 'TestClip');
    expect(clip.name).toBe('TestClip');
  });

  it('buildClipFromFrames() duration is in seconds (durationMs / 1000)', () => {
    const bone = new THREE.Bone(); bone.name = 'Spine';
    const skeleton = new THREE.Skeleton([bone]);
    const frames: BoneFrame[] = [
      { time: 0,    boneIndex: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      { time: 2000, boneIndex: 0, qx: 0.2, qy: 0, qz: 0, qw: 0.98 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 2000);
    expect(clip.duration).toBeCloseTo(2, 3);
  });

  it('buildClipFromFrames() skips static bones (all same quaternion)', () => {
    const bone = new THREE.Bone(); bone.name = 'StaticBone';
    const skeleton = new THREE.Skeleton([bone]);
    const frames: BoneFrame[] = [
      { time: 0,    boneIndex: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      { time: 500,  boneIndex: 0, qx: 0, qy: 0, qz: 0, qw: 1 }, // no movement
    ];
    const clip = buildClipFromFrames(frames, skeleton, 500);
    expect(clip.tracks).toHaveLength(0);
  });

  it('buildClipFromFrames() names tracks as "BoneName.quaternion"', () => {
    const bone = new THREE.Bone(); bone.name = 'RightArm';
    const skeleton = new THREE.Skeleton([bone]);
    const frames: BoneFrame[] = [
      { time: 0,   boneIndex: 0, qx: 0, qy: 0, qz: 0, qw: 1 },
      { time: 200, boneIndex: 0, qx: 0.5, qy: 0, qz: 0, qw: 0.866 },
    ];
    const clip = buildClipFromFrames(frames, skeleton, 200);
    expect(clip.tracks[0]!.name).toBe('RightArm.quaternion');
  });

  it('buildClipFromFrames() with empty frames → 0 tracks', () => {
    const bone = new THREE.Bone(); bone.name = 'Empty';
    const skeleton = new THREE.Skeleton([bone]);
    const clip = buildClipFromFrames([], skeleton, 1000);
    expect(clip.tracks).toHaveLength(0);
  });

  it.todo('export recorded clip as .glb with animation embedded');
  it.todo('export recorded clip as .bvh (Biovision Hierarchy)');
  it.todo('NLA editor — layer multiple clips with weight blending');
  it.todo('animation graph — state machine with transitions (idle/walk/run)');
  it.todo('root motion extraction — bake Y-axis translation to root bone');
  it.todo('HoloScript @animate trait refs a clip ID and plays on scene load');
});

// ═══════════════════════════════════════════════════════════════════
// 4. Keyframe Timeline — Linear Evaluation (pure)
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animator — Keyframe Evaluation (Linear)', () => {
  const TRACK_X = makeTrack('t1', [
    makeKF('k0', 0, 0), makeKF('k1', 1, 10), makeKF('k2', 2, 5), makeKF('k3', 4, 20),
  ]);

  it('evaluates exact keyframe value at t=0', () => expect(evaluateTrack(TRACK_X, 0)).toBe(0));
  it('evaluates exact keyframe value at t=1', () => expect(evaluateTrack(TRACK_X, 1)).toBe(10));
  it('interpolates linearly at t=0.5 → 5', () => expect(evaluateTrack(TRACK_X, 0.5)).toBeCloseTo(5));
  it('interpolates linearly between t=2 and t=4 at t=3 → 12.5', () => expect(evaluateTrack(TRACK_X, 3)).toBeCloseTo(12.5));
  it('clamps to first keyframe value before t=0', () => expect(evaluateTrack(TRACK_X, -1)).toBe(0));
  it('clamps to last keyframe value after last keyframe', () => expect(evaluateTrack(TRACK_X, 99)).toBe(20));
  it('returns null for an empty track', () => expect(evaluateTrack(makeTrack('e', []), 0.5)).toBeNull());
  it('single-keyframe track returns that value at any time', () => {
    const solo = makeTrack('solo', [makeKF('k', 2, 42)]);
    expect(evaluateTrack(solo, 0)).toBe(42);
    expect(evaluateTrack(solo, 100)).toBe(42);
  });
  it('dense keyframes (60fps, 5s) evaluate correctly', () => {
    const kfs: Keyframe[] = [];
    for (let i = 0; i <= 300; i++) kfs.push(makeKF(`k${i}`, i / 60, Math.sin(i / 60)));
    expect(Math.abs(evaluateTrack(makeTrack('d', kfs), 2.5)! - Math.sin(2.5))).toBeLessThan(0.02);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 5. Easing Curves — "Marco applies curve shaping to keyframes"
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animator — Easing Curves', () => {
  it('linear(0) = 0, linear(1) = 1, linear(0.5) = 0.5', () => {
    expect(linear(0)).toBe(0);
    expect(linear(1)).toBe(1);
    expect(linear(0.5)).toBe(0.5);
  });

  it('easeInCubic(0) = 0, easeInCubic(1) = 1', () => {
    expect(easeInCubic(0)).toBeCloseTo(0);
    expect(easeInCubic(1)).toBeCloseTo(1);
  });

  it('easeInCubic is slower than linear at t=0.5 (value < 0.5)', () => {
    expect(easeInCubic(0.5)).toBeLessThan(0.5);
  });

  it('easeOutCubic is faster than linear at t=0.5 (value > 0.5)', () => {
    expect(easeOutCubic(0.5)).toBeGreaterThan(0.5);
  });

  it('easeInOutCubic is symmetric around t=0.5', () => {
    expect(easeInOutCubic(0.25)).toBeCloseTo(1 - easeInOutCubic(0.75), 5);
  });

  it('easeInOutSine is symmetric around t=0.5', () => {
    expect(easeInOutSine(0.3)).toBeCloseTo(1 - easeInOutSine(0.7), 5);
  });

  it('easeInExpo starts very slow (close to 0 at t=0.1)', () => {
    expect(easeInExpo(0.1)).toBeLessThan(0.01);
  });

  it('easeOutExpo ends very fast (close to 1 at t=0.9)', () => {
    expect(easeOutExpo(0.9)).toBeGreaterThan(0.99);
  });

  it('easeOutBounce overshoots back at t=1 → 1', () => {
    expect(easeOutBounce(1)).toBeCloseTo(1, 5);
  });

  it('easeOutBounce produces intermediate overshoot (dips then recovers)', () => {
    // At some point between 0 and 1 the value should be > linear equivalent
    const sample = easeOutBounce(0.7);
    expect(sample).toBeGreaterThan(0.5);
  });

  it('easeInBack overshoots below 0 at mid-range', () => {
    expect(easeInBack(0.2)).toBeLessThan(0);
  });

  it('easeOutBack overshoots above 1 at mid-range (then returns to 1)', () => {
    // Check the overshoot region
    const maxVal = Math.max(...[0.7,0.75,0.8,0.85,0.9].map(easeOutBack));
    expect(maxVal).toBeGreaterThan(1);
  });

  it('easeInElastic oscillates before settling (value < 0 near start)', () => {
    const vals = [0.05, 0.1, 0.15, 0.2].map(easeInElastic);
    expect(Math.min(...vals)).toBeLessThan(0);
  });

  it('easeOutElastic oscillates after main movement (value > 1 near end)', () => {
    const vals = [0.7, 0.75, 0.8].map(easeOutElastic);
    expect(Math.max(...vals)).toBeGreaterThan(1);
  });

  it('cubicBezier(linear) matches linear for all t', () => {
    const bezierLinear = cubicBezier(0, 0, 1, 1);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      expect(bezierLinear(t)).toBeCloseTo(t, 3);
    }
  });

  it('CSS_EASE_IN starts slow (value < cubic ease-in at t=0.3)', () => {
    expect(CSS_EASE_IN(0.3)).toBeLessThan(0.3);
  });

  it('CSS_EASE_OUT starts fast (value > 0.3 at t=0.3)', () => {
    expect(CSS_EASE_OUT(0.3)).toBeGreaterThan(0.3);
  });

  it('applyEasing with ease-in produces lower intermediate value than linear', () => {
    const easedVal = applyEasing(0, 100, 0.5, 'ease-in');
    const linearVal = 50;
    expect(easedVal).toBeLessThan(linearVal);
  });

  it('applyEasing with ease-out produces higher intermediate value than linear', () => {
    const easedVal = applyEasing(0, 100, 0.5, 'ease-out');
    expect(easedVal).toBeGreaterThan(50);
  });

  it('evaluateTrackWithEasing uses easing per–segment', () => {
    const kfs = [
      { time: 0, value: 0, easing: 'linear' as const },
      { time: 1, value: 100, easing: 'ease-in' as const },
    ];
    const easedMid = evaluateTrackWithEasing(kfs, 0.5);
    expect(easedMid).not.toBeNull();
    expect(easedMid!).toBeLessThan(50); // ease-in is slow at start
  });

  it('insertKeyframeSorted inserts into the correct position by time', () => {
    const kfs = [makeKF('a', 0, 0), makeKF('c', 2, 20)];
    const result = insertKeyframeSorted(kfs, makeKF('b', 1, 10));
    expect(result.map(k => k.time)).toEqual([0, 1, 2]);
  });

  it('insertKeyframeSorted at the end works', () => {
    const kfs = [makeKF('a', 0, 0), makeKF('b', 1, 10)];
    const result = insertKeyframeSorted(kfs, makeKF('c', 5, 50));
    expect(result[2]!.time).toBe(5);
  });

  it('insertKeyframeSorted at the beginning works', () => {
    const kfs = [makeKF('b', 1, 10), makeKF('c', 2, 20)];
    const result = insertKeyframeSorted(kfs, makeKF('a', 0, 0));
    expect(result[0]!.time).toBe(0);
  });

  it('insertKeyframeSorted does not mutate the original array', () => {
    const kfs = [makeKF('a', 0, 0)];
    insertKeyframeSorted(kfs, makeKF('b', 1, 10));
    expect(kfs).toHaveLength(1);
  });

  it.todo('easing functions applied in the KeyframeEditor curve view');
  it.todo('addKeyframe() inserts in time-sorted order via insertKeyframeSorted');
  it.todo('playback loop — clip loops at end when loop=true');
});

// ═══════════════════════════════════════════════════════════════════
// 6. Export & Integration
// ═══════════════════════════════════════════════════════════════════

describe('Scenario: Animator — Export & Integration', () => {
  it.todo('export recorded clip as .glb with animation embedded');
  it.todo('export recorded clip as .bvh (Biovision Hierarchy)');
  it.todo('NLA editor — layer multiple clips with weight blending');
  it.todo('animation graph — state machine with transitions');
  it.todo('publish character + animation to HoloScript Gallery');
});
