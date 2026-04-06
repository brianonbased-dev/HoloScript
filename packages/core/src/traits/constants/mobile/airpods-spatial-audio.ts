/**
 * AirPods Spatial Audio Traits (M.010.11)
 *
 * Head-tracked 3D audio tied to holographic sound sources.
 * AVFoundation spatial audio with AirPods Pro/Max head tracking.
 *
 * Categories:
 *   - Source (position, falloff, directivity)
 *   - Head tracking (pin audio in space as user turns)
 *   - Environment (reverb, occlusion)
 */
export const AIRPODS_SPATIAL_AUDIO_TRAITS = [
  'spatial_audio_airpods',     // enable AirPods spatial audio
  'audio_head_track',          // head-tracked audio stays pinned in space
  'audio_source_3d',           // define 3D audio source position on .holo entity
  'audio_falloff',             // distance-based volume falloff model
  'audio_directivity',         // directional audio cone (inner/outer angle)
  'audio_reverb_match',        // match reverb to physical room acoustics
  'audio_occlusion',           // audio occluded by physical/holographic objects
] as const;

export type AirPodsSpatialAudioTraitName = (typeof AIRPODS_SPATIAL_AUDIO_TRAITS)[number];
