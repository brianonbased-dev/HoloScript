/**
 * XR Platform & Spatial Computing Traits
 */
export const XR_PLATFORM_TRAITS = [
  'passthrough',
  'room_scale',
  'world_scale',
  'tabletop_scale',
  'shared_space',
  'persistent_world',
  'cross_platform',
  'webxr',
  'openxr',
  'arkit',
  'arcore',
  'visionos',
  'quest_native',
  'pcvr',
  'mobile_ar',
  'headset_only',
  'controller_required',
  'hands_only',
  'seated_experience',
  'standing_experience',
  'room_boundary',
  'guardian_system',
  'mixed_reality',
  'diminished_reality',
  'augmented_virtuality',
  // V43 Tier 1: Spatial Systems
  'spatial_awareness',
  'shared_world',
  // V43 Tier 2: visionOS Spatial Persona & SharePlay
  'spatial_persona',
  'shareplay',
  // V43 Tier 2: visionOS Object Tracking & Scene Reconstruction
  'object_tracking',
  'scene_reconstruction',
  'realitykit_mesh',
  'room_mesh',
  'volumetric_window',
  'spatial_navigation',
] as const;
