/**
 * @holoscript/mixamo-plugin — Mixamo animation-library bridge stub.
 *
 * Research: ai-ecosystem/research/2026-04-21_mixamo-programmatic-upload.md
 * Universal-IR matrix: docs/universal-ir-coverage.md (animation column)
 *
 * Status: STUB. Per the research memo, Mixamo has no supported public
 * upload API — this plugin is download/metadata-only. Real FBX parsing +
 * retargeting to VRM/URDF skeletons is future work.
 */

export interface MixamoClipMetadata {
  clip_id: string;
  name: string;
  duration_seconds: number;
  fps: number;
  bone_names: string[]; // expected Mixamo standard skeleton
  in_place: boolean;    // in-place (on-spot) vs with-root-motion
}

export interface HoloAnimClipEmission {
  trait: { kind: '@anim_clip'; target_id: string; params: Record<string, unknown> };
  retarget_compat: 'vrm' | 'urdf' | 'unknown';
  warnings: string[];
}

// Coarse VRM-humanoid compatibility check via bone-name overlap
const VRM_HUMANOID_HINTS = ['hips', 'spine', 'head', 'leftarm', 'rightarm', 'leftleg', 'rightleg'];

export function mapMixamoClip(clip: MixamoClipMetadata): HoloAnimClipEmission {
  const warnings: string[] = [];
  const lowered = clip.bone_names.map((b) => b.toLowerCase());
  const vrm_hits = VRM_HUMANOID_HINTS.filter((h) => lowered.some((b) => b.includes(h))).length;
  const retarget_compat: 'vrm' | 'urdf' | 'unknown' =
    vrm_hits >= 5 ? 'vrm' : vrm_hits >= 2 ? 'unknown' : 'unknown';

  if (!clip.in_place && !lowered.some((b) => b.includes('root'))) {
    warnings.push('with-root-motion clip lacks a root bone — retarget may drift');
  }
  if (clip.fps !== 24 && clip.fps !== 30 && clip.fps !== 60) {
    warnings.push(`unusual fps=${clip.fps}; most Mixamo clips are 24/30/60`);
  }

  return {
    trait: {
      kind: '@anim_clip',
      target_id: clip.clip_id,
      params: {
        name: clip.name,
        duration_seconds: clip.duration_seconds,
        fps: clip.fps,
        in_place: clip.in_place,
        frame_count: Math.round(clip.duration_seconds * clip.fps),
        retarget_compat,
      },
    },
    retarget_compat,
    warnings,
  };
}
