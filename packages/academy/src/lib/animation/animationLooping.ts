/**
 * animationLooping.ts — Auto-Loop Detection & Seamless Loop Generation
 *
 * MEME-006: Auto-loop animations for infinite meme potential
 * Priority: High | Estimate: 2 hours
 *
 * Features:
 * - Detect if animation can loop seamlessly
 * - Generate loop transitions
 * - Fix jarring loop points
 * - Interpolate start/end frames for smooth loops
 */

import type { BoneFrame, RecordedClip } from './animationBuilder';
import * as THREE from 'three';

export interface LoopAnalysis {
  canLoop: boolean;
  loopQuality: 'perfect' | 'good' | 'fair' | 'poor';
  startEndDistance: number; // Quaternion distance
  suggestedBlendFrames: number;
  problematicBones: string[];
}

export interface LoopOptions {
  /**
   * Enable automatic loop detection
   * Default: true
   */
  autoDetect?: boolean;

  /**
   * Maximum distance threshold for "perfect" loop
   * Default: 0.01 (very close)
   */
  perfectThreshold?: number;

  /**
   * Maximum distance threshold for "good" loop
   * Default: 0.05
   */
  goodThreshold?: number;

  /**
   * Number of frames to blend at loop point
   * Default: 5 (at 60fps = 83ms)
   */
  blendFrames?: number;

  /**
   * Apply easing to blend transition
   * Default: true
   */
  useEasing?: boolean;
}

/**
 * Analyze if animation can loop seamlessly
 */
export function analyzeLoop(clip: RecordedClip, options: LoopOptions = {}): LoopAnalysis {
  const { perfectThreshold = 0.01, goodThreshold = 0.05 } = options;

  if (clip.frames.length === 0) {
    return {
      canLoop: false,
      loopQuality: 'poor',
      startEndDistance: Infinity,
      suggestedBlendFrames: 0,
      problematicBones: [],
    };
  }

  // Group frames by bone
  const boneFrameMap = new Map<number, BoneFrame[]>();
  clip.frames.forEach((frame) => {
    if (!boneFrameMap.has(frame.boneIndex)) {
      boneFrameMap.set(frame.boneIndex, []);
    }
    boneFrameMap.get(frame.boneIndex)!.push(frame);
  });

  // Calculate distance between start and end for each bone
  const boneDistances: Array<{ boneIndex: number; distance: number }> = [];
  let maxDistance = 0;
  const problematicBones: string[] = [];

  boneFrameMap.forEach((frames, boneIndex) => {
    if (frames.length < 2) return;

    const startFrame = frames[0];
    const endFrame = frames[frames.length - 1];

    const startQuat = new THREE.Quaternion(
      startFrame.qx,
      startFrame.qy,
      startFrame.qz,
      startFrame.qw
    );
    const endQuat = new THREE.Quaternion(endFrame.qx, endFrame.qy, endFrame.qz, endFrame.qw);

    const distance = quatDistance(startQuat, endQuat);
    boneDistances.push({ boneIndex, distance });

    if (distance > maxDistance) {
      maxDistance = distance;
    }

    if (distance > goodThreshold) {
      problematicBones.push(`Bone_${boneIndex}`);
    }
  });

  // Determine loop quality
  let loopQuality: LoopAnalysis['loopQuality'];
  let suggestedBlendFrames: number;

  if (maxDistance < perfectThreshold) {
    loopQuality = 'perfect';
    suggestedBlendFrames = 0; // No blending needed
  } else if (maxDistance < goodThreshold) {
    loopQuality = 'good';
    suggestedBlendFrames = 3;
  } else if (maxDistance < goodThreshold * 2) {
    loopQuality = 'fair';
    suggestedBlendFrames = 5;
  } else {
    loopQuality = 'poor';
    suggestedBlendFrames = 10;
  }

  return {
    canLoop: maxDistance < goodThreshold * 3, // Loops up to 3x threshold
    loopQuality,
    startEndDistance: maxDistance,
    suggestedBlendFrames,
    problematicBones,
  };
}

/**
 * Generate seamless loop by blending start/end frames
 */
export function generateSeamlessLoop(clip: RecordedClip, options: LoopOptions = {}): RecordedClip {
  const { blendFrames = 5, useEasing = true } = options;

  const analysis = analyzeLoop(clip, options);

  // If already perfect, return as-is
  if (analysis.loopQuality === 'perfect') {
    return clip;
  }

  // If too poor to loop, add warning
  if (analysis.loopQuality === 'poor') {
    console.warn('[Loop] Animation has poor loop quality. Consider re-recording.');
  }

  // Group frames by bone
  const boneFrameMap = new Map<number, BoneFrame[]>();
  clip.frames.forEach((frame) => {
    if (!boneFrameMap.has(frame.boneIndex)) {
      boneFrameMap.set(frame.boneIndex, []);
    }
    boneFrameMap.get(frame.boneIndex)!.push(frame);
  });

  // Generate blended frames
  const blendedFrames: BoneFrame[] = [];
  const frameDuration = clip.duration / 60; // Assume 60fps

  boneFrameMap.forEach((frames, boneIndex) => {
    if (frames.length < 2) {
      blendedFrames.push(...frames);
      return;
    }

    // Keep middle frames as-is
    const middleFrames = frames.slice(0, -blendFrames);
    blendedFrames.push(...middleFrames);

    // Generate blend frames at the end
    const startFrame = frames[0];
    const endFrames = frames.slice(-blendFrames);

    endFrames.forEach((endFrame, i) => {
      const t = useEasing ? easeInOutCubic(i / blendFrames) : i / blendFrames;

      const startQuat = new THREE.Quaternion(
        startFrame.qx,
        startFrame.qy,
        startFrame.qz,
        startFrame.qw
      );
      const endQuat = new THREE.Quaternion(endFrame.qx, endFrame.qy, endFrame.qz, endFrame.qw);

      const blendedQuat = new THREE.Quaternion().slerpQuaternions(startQuat, endQuat, t);

      blendedFrames.push({
        time: endFrame.time,
        boneIndex,
        qx: blendedQuat.x,
        qy: blendedQuat.y,
        qz: blendedQuat.z,
        qw: blendedQuat.w,
      });
    });
  });

  return {
    ...clip,
    frames: blendedFrames.sort((a, b) => a.time - b.time),
  };
}

/**
 * Calculate distance between two quaternions
 * Returns value between 0 (identical) and 2 (opposite)
 */
function quatDistance(q1: THREE.Quaternion, q2: THREE.Quaternion): number {
  const dot = Math.abs(q1.dot(q2));
  // dot = 1 means identical, dot = -1 means opposite
  // Convert to distance: 0 = identical, 2 = opposite
  return 1 - dot;
}

/**
 * Cubic easing for smooth transitions
 */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Extend animation by duplicating and appending (for longer loops)
 */
export function extendAnimation(clip: RecordedClip, repetitions: number): RecordedClip {
  if (repetitions <= 1) return clip;

  const extendedFrames: BoneFrame[] = [];

  for (let rep = 0; rep < repetitions; rep++) {
    const timeOffset = rep * clip.duration;

    clip.frames.forEach((frame) => {
      extendedFrames.push({
        ...frame,
        time: frame.time + timeOffset,
      });
    });
  }

  return {
    ...clip,
    duration: clip.duration * repetitions,
    frames: extendedFrames,
    name: `${clip.name} (${repetitions}x)`,
  };
}

/**
 * Reverse animation (for palindrome loops)
 */
export function reverseAnimation(clip: RecordedClip): RecordedClip {
  const maxTime = Math.max(...clip.frames.map((f) => f.time));

  const reversedFrames = clip.frames.map((frame) => ({
    ...frame,
    time: maxTime - frame.time,
  }));

  return {
    ...clip,
    frames: reversedFrames.sort((a, b) => a.time - b.time),
    name: `${clip.name} (Reversed)`,
  };
}

/**
 * Create palindrome loop (forward + backward)
 * Great for smooth idle animations
 */
export function createPalindromeLoop(clip: RecordedClip): RecordedClip {
  const reversed = reverseAnimation(clip);

  const palindromeFrames = [
    ...clip.frames,
    ...reversed.frames.map((frame) => ({
      ...frame,
      time: frame.time + clip.duration,
    })),
  ];

  return {
    ...clip,
    duration: clip.duration * 2,
    frames: palindromeFrames,
    name: `${clip.name} (Palindrome)`,
  };
}

/**
 * Get loop recommendations based on analysis
 */
export function getLoopRecommendations(analysis: LoopAnalysis): string[] {
  const recommendations: string[] = [];

  if (analysis.loopQuality === 'perfect') {
    recommendations.push('✅ Animation loops perfectly! No adjustments needed.');
  } else if (analysis.loopQuality === 'good') {
    recommendations.push(
      `✓ Good loop quality. Consider blending ${analysis.suggestedBlendFrames} frames for smoother transition.`
    );
  } else if (analysis.loopQuality === 'fair') {
    recommendations.push(
      '⚠️ Fair loop quality. Blending recommended to reduce jarring transition.'
    );
    recommendations.push(`Blend ${analysis.suggestedBlendFrames} frames at loop point.`);
  } else {
    recommendations.push(
      '❌ Poor loop quality. Consider re-recording with matching start/end poses.'
    );
    recommendations.push(`Problematic bones: ${analysis.problematicBones.join(', ')}`);
    recommendations.push(
      'Tip: Record in a circular motion or use palindrome mode (forward + backward).'
    );
  }

  return recommendations;
}
