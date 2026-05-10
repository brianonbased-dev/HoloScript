/**
 * MixamoRetargeter.ts
 *
 * Animation retargeting from Mixamo FBX skeleton to VRM and URDF skeletons.
 *
 * Takes parsed Mixamo animation data (bone-local transforms over time) and
 * remaps it onto target skeleton bone names, producing an engine-native
 * `AnimClip` compatible with `BoneSystem` and `AnimationEngine`.
 *
 * Pattern: source-rig → humanoid canonical → target-rig
 *   1. Mixamo bone names are looked up via MIXAMO_BONE_MAP
 *   2. Canonical HumanoidBoneName serves as the pivot
 *   3. Target bone names are resolved via VRM_BONE_MAP or URDF_BONE_MAP
 *
 * @see HumanoidSkeleton.ts for bone mapping tables
 * @see AnimationClip.ts for the output AnimClip format
 * @module animation
 */

import {
  type HumanoidBoneName,
  HUMANOID_BONE_NAMES,
  MIXAMO_BONE_MAP,
  VRM_BONE_MAP,
  URDF_BONE_MAP,
} from '../character/HumanoidSkeleton';
import { AnimClip, type ClipTrack, type InterpolationMode } from './AnimationClip';

// =============================================================================
// TYPES
// =============================================================================

/** A single keyframe for a bone's local transform. */
export interface MixamoKeyframe {
  time: number; // seconds, 0-based
  position: [number, number, number];
  rotation: [number, number, number, number]; // quaternion [x, y, z, w]
  scale?: [number, number, number];
}

/** Animation curve for one Mixamo bone. */
export interface MixamoBoneAnimation {
  mixamoBoneName: string;
  keyframes: MixamoKeyframe[];
}

/** Complete parsed Mixamo animation source. */
export interface MixamoAnimationSource {
  id: string;
  name: string;
  duration: number;
  boneAnimations: MixamoBoneAnimation[];
}

/** Per-bone retargeting options. */
export interface BoneRetargetOptions {
  /** Override the target bone name (defaults to config map). */
  targetBoneName?: string;
  /** Position scale factor for this bone. */
  positionScale?: number;
  /** Rotation offset (euler radians) applied before output. */
  rotationOffset?: [number, number, number];
  /** Whether to invert the rotation quaternion. */
  invertRotation?: boolean;
  /** Skip this bone entirely. */
  skip?: boolean;
}

/** Target skeleton format. */
export type RetargetTarget = 'vrm' | 'urdf';

/** Configuration for the retargeting operation. */
export interface RetargetConfig {
  target: RetargetTarget;
  /** Optional per-bone overrides keyed by canonical HumanoidBoneName. */
  boneOverrides?: Partial<Record<HumanoidBoneName, BoneRetargetOptions>>;
  /** Global position scale (applied after per-bone scale). */
  globalPositionScale?: number;
  /** Global rotation offset in radians [x, y, z]. */
  globalRotationOffset?: [number, number, number];
  /** Interpolation mode for generated tracks. Default: 'linear' for position, 'slerp' for rotation. */
  interpolationMode?: InterpolationMode;
  /** Loop mode for the output clip. */
  loop?: boolean;
  /** Speed multiplier. */
  speed?: number;
}

// =============================================================================
// INVERSE INDEX: Mixamo name → HumanoidBoneName
// =============================================================================

const MIXAMO_TO_HUMANOID: Map<string, HumanoidBoneName> = new Map();
for (const [humanoidName, mixamoName] of Object.entries(MIXAMO_BONE_MAP)) {
  if (mixamoName) {
    MIXAMO_TO_HUMANOID.set(mixamoName, humanoidName as HumanoidBoneName);
  }
}

// =============================================================================
// RETARGETER
// =============================================================================

/**
 * Mixamo animation retargeter.
 *
 * Converts Mixamo-sourced animation curves into target-skeleton `AnimClip`
 * tracks. The retargeting is deterministic: identical input + config always
 * produces identical output tracks (required for P2-0 determinism claims).
 *
 * @example
 * ```ts
 * import { MixamoRetargeter, vrmRetargetConfig } from '@holoscript/engine/animation';
 *
 * const retargeter = new MixamoRetargeter();
 * const source = parseMixamoFBX(fbxBuffer); // user-provided parser
 * const clip = retargeter.retarget(source, vrmRetargetConfig());
 *
 * // clip is ready for AnimationEngine.play()
 * ```
 */
export class MixamoRetargeter {
  /**
   * Retarget a Mixamo animation to a target skeleton.
   *
   * @param source - Parsed Mixamo animation data.
   * @param config - Retargeting configuration (target skeleton, overrides).
   * @returns A new `AnimClip` with tracks mapped to the target skeleton.
   */
  retarget(source: MixamoAnimationSource, config: RetargetConfig): AnimClip {
    const clip = new AnimClip(source.id, source.name, source.duration);
    clip.setLoop(config.loop ?? false);
    clip.setSpeed(config.speed ?? 1.0);

    // Resolve target bone map
    const targetMap = config.target === 'vrm' ? VRM_BONE_MAP : URDF_BONE_MAP;

    for (const boneAnim of source.boneAnimations) {
      // 1. Resolve canonical humanoid bone name from Mixamo name
      const humanoidName = MIXAMO_TO_HUMANOID.get(boneAnim.mixamoBoneName);
      if (!humanoidName) {
        // Unmapped Mixamo bone — skip (e.g. finger bones not in our 65-bone template)
        continue;
      }

      // 2. Check per-bone overrides
      const overrides = config.boneOverrides?.[humanoidName] ?? {};
      if (overrides.skip) continue;

      // 3. Resolve target bone name
      let targetBoneName = overrides.targetBoneName ?? targetMap[humanoidName];
      if (!targetBoneName) {
        // No mapping for this bone in the chosen target format
        continue;
      }

      // 4. Build retargeted tracks
      this.buildBoneTracks(boneAnim, targetBoneName, clip, config, overrides);
    }

    return clip;
  }

  // ---------------------------------------------------------------------------
  // Track Building
  // ---------------------------------------------------------------------------

  private buildBoneTracks(
    boneAnim: MixamoBoneAnimation,
    targetBoneName: string,
    clip: AnimClip,
    config: RetargetConfig,
    overrides: BoneRetargetOptions
  ): void {
    const kfs = boneAnim.keyframes;
    if (kfs.length === 0) return;

    const posScale = (overrides.positionScale ?? 1.0) * (config.globalPositionScale ?? 1.0);
    const rotOffset = overrides.rotationOffset ?? config.globalRotationOffset ?? [0, 0, 0];
    const invertRot = overrides.invertRotation ?? false;

    // --- Position tracks (x, y, z) ---
    const posComponents: Array<{ component: string; idx: number }> = [
      { component: 'x', idx: 0 },
      { component: 'y', idx: 1 },
      { component: 'z', idx: 2 },
    ];

    for (const { component, idx } of posComponents) {
      const track: ClipTrack = {
        id: `${targetBoneName}-pos-${component}`,
        targetPath: targetBoneName,
        property: 'position',
        component,
        interpolation: config.interpolationMode ?? 'linear',
        keyframes: kfs.map((kf) => ({
          time: kf.time,
          value: kf.position[idx] * posScale,
        })),
      };
      clip.addTrack(track);
    }

    // --- Rotation tracks (quaternion x, y, z, w) ---
    // Pre-compute offset quaternion if rotationOffset is non-zero
    const offsetQuat =
      rotOffset[0] !== 0 || rotOffset[1] !== 0 || rotOffset[2] !== 0
        ? eulerToQuaternion(rotOffset[0], rotOffset[1], rotOffset[2])
        : null;

    const rotComponents: Array<{ component: string; idx: number }> = [
      { component: 'x', idx: 0 },
      { component: 'y', idx: 1 },
      { component: 'z', idx: 2 },
      { component: 'w', idx: 3 },
    ];

    for (const { component, idx } of rotComponents) {
      const track: ClipTrack = {
        id: `${targetBoneName}-rot-${component}`,
        targetPath: targetBoneName,
        property: 'rotation',
        component,
        interpolation: 'slerp',
        keyframes: kfs.map((kf) => {
          let qx = kf.rotation[0];
          let qy = kf.rotation[1];
          let qz = kf.rotation[2];
          let qw = kf.rotation[3];

          if (invertRot) {
            qx = -qx;
            qy = -qy;
            qz = -qz;
          }

          if (offsetQuat) {
            const [ox, oy, oz, ow] = offsetQuat;
            // q' = offset * q  (hamilton product)
            const rx = ow * qx + ox * qw + oy * qz - oz * qy;
            const ry = ow * qy - ox * qz + oy * qw + oz * qx;
            const rz = ow * qz + ox * qy - oy * qx + oz * qw;
            const rw = ow * qw - ox * qx - oy * qy - oz * qz;
            qx = rx;
            qy = ry;
            qz = rz;
            qw = rw;
          }

          return {
            time: kf.time,
            value: [qx, qy, qz, qw][idx],
          };
        }),
      };
      clip.addTrack(track);
    }

    // --- Scale tracks (optional, usually identity) ---
    const hasNonIdentityScale = kfs.some(
      (kf) =>
        kf.scale &&
        (Math.abs(kf.scale[0] - 1.0) > 0.0001 ||
          Math.abs(kf.scale[1] - 1.0) > 0.0001 ||
          Math.abs(kf.scale[2] - 1.0) > 0.0001)
    );

    if (hasNonIdentityScale) {
      const scaleComponents: Array<{ component: string; idx: number }> = [
        { component: 'x', idx: 0 },
        { component: 'y', idx: 1 },
        { component: 'z', idx: 2 },
      ];

      for (const { component, idx } of scaleComponents) {
        const track: ClipTrack = {
          id: `${targetBoneName}-scale-${component}`,
          targetPath: targetBoneName,
          property: 'scale',
          component,
          interpolation: config.interpolationMode ?? 'linear',
          keyframes: kfs.map((kf) => ({
            time: kf.time,
            value: kf.scale?.[idx] ?? 1.0,
          })),
        };
        clip.addTrack(track);
      }
    }
  }
}

// =============================================================================
// PRESET CONFIGS
// =============================================================================

/**
 * Default retarget config for VRM 1.0 avatars.
 *
 * VRM uses Y-up, meters-scale coordinate system aligned with Mixamo output.
 * No global scale or rotation offset required for typical humanoids.
 */
export function vrmRetargetConfig(overrides?: Partial<RetargetConfig>): RetargetConfig {
  return {
    target: 'vrm',
    globalPositionScale: 1.0,
    globalRotationOffset: [0, 0, 0],
    loop: false,
    speed: 1.0,
    ...overrides,
  };
}

/**
 * Default retarget config for URDF humanoid robots.
 *
 * URDF is typically Z-up with SI units (meters). Mixamo output is Y-up.
 * The retargeted animation may need a -90° X rotation for Z-up targets,
 * but this is often handled at the importer level. We keep identity by
 * default and let callers supply `globalRotationOffset` if needed.
 */
export function urdfRetargetConfig(overrides?: Partial<RetargetConfig>): RetargetConfig {
  return {
    target: 'urdf',
    globalPositionScale: 1.0,
    globalRotationOffset: [0, 0, 0],
    loop: false,
    speed: 1.0,
    ...overrides,
  };
}

// =============================================================================
// UTILITY: Euler → Quaternion
// =============================================================================

/**
 * Convert Euler angles (radians, XYZ order) to a quaternion [x, y, z, w].
 *
 * Deterministic: same input always produces the same output bit pattern.
 */
function eulerToQuaternion(ex: number, ey: number, ez: number): [number, number, number, number] {
  const cx = Math.cos(ex * 0.5);
  const sx = Math.sin(ex * 0.5);
  const cy = Math.cos(ey * 0.5);
  const sy = Math.sin(ey * 0.5);
  const cz = Math.cos(ez * 0.5);
  const sz = Math.sin(ez * 0.5);

  // XYZ order
  const w = cx * cy * cz + sx * sy * sz;
  const x = sx * cy * cz - cx * sy * sz;
  const y = cx * sy * cz + sx * cy * sz;
  const z = cx * cy * sz - sx * sy * cz;

  return [x, y, z, w];
}

// =============================================================================
// CONVENIENCE FUNCTIONS
// =============================================================================

/**
 * One-shot retarget to VRM.
 *
 * @param source - Parsed Mixamo animation.
 * @param overrides - Optional config overrides.
 */
export function retargetToVRM(source: MixamoAnimationSource, overrides?: Partial<RetargetConfig>): AnimClip {
  const retargeter = new MixamoRetargeter();
  return retargeter.retarget(source, vrmRetargetConfig(overrides));
}

/**
 * One-shot retarget to URDF.
 *
 * @param source - Parsed Mixamo animation.
 * @param overrides - Optional config overrides.
 */
export function retargetToURDF(source: MixamoAnimationSource, overrides?: Partial<RetargetConfig>): AnimClip {
  const retargeter = new MixamoRetargeter();
  return retargeter.retarget(source, urdfRetargetConfig(overrides));
}

/**
 * List all Mixamo bone names that are retargetable to the given target format.
 *
 * Useful for UI "supported bones" display and validation.
 */
export function getRetargetableBones(target: RetargetTarget): string[] {
  const targetMap = target === 'vrm' ? VRM_BONE_MAP : URDF_BONE_MAP;
  const result: string[] = [];
  for (const humanoidName of HUMANOID_BONE_NAMES) {
    const mixamoName = MIXAMO_BONE_MAP[humanoidName];
    const targetName = targetMap[humanoidName];
    if (mixamoName && targetName) {
      result.push(mixamoName);
    }
  }
  return result;
}

/**
 * Check whether a specific Mixamo bone can be retargeted to the given target.
 */
export function isRetargetable(mixamoBoneName: string, target: RetargetTarget): boolean {
  const humanoidName = MIXAMO_TO_HUMANOID.get(mixamoBoneName);
  if (!humanoidName) return false;
  const targetMap = target === 'vrm' ? VRM_BONE_MAP : URDF_BONE_MAP;
  return !!targetMap[humanoidName];
}
