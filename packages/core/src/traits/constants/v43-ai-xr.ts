/**
 * V43 AI & XR Traits — Tier 1, 2 & 3
 *
 * All new traits introduced in V43 that were missing from VRTraitName.
 * Split into visionOS/XR, AI generation, and knowledge/perception groups.
 */
export const V43_AI_XR_TRAITS = [
  // visionOS / XR (Tier 2)
  'spatial_persona',
  'shareplay',
  'object_tracking',
  'scene_reconstruction',
  'volumetric_window',
  'spatial_navigation',
  'eye_tracked',
  'realitykit_mesh',
  'eye_hand_fusion',
  // AI generation (Tier 2)
  'controlnet',
  'ai_texture_gen',
  'diffusion_realtime',
  'ai_upscaling',
  'ai_inpainting',
  'neural_link',
  'neural_forge',
  // Knowledge & perception (Tier 3)
  'embedding_search',
  'ai_npc_brain',
  'vector_db',
  'vision',
  'spatial_awareness',
  'neural_animation',
  'ai_vision',
] as const;
