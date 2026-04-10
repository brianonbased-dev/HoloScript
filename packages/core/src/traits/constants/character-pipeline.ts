/**
 * Character Pipeline Traits
 *
 * 7-stage character creation pipeline: sculpt, mesh extraction,
 * hollow/LOD, rigging, FACS, materials/clothing/hair, deploy.
 *
 * @see Characters as Code vision (2026-03-26)
 * @see W.238: Characters as Code is HoloScript's highest-value differentiator
 * @see W.239: Authoring vs runtime resolution — compiler is the bridge
 */
export const CHARACTER_PIPELINE_TRAITS = [
  // Stage 1: Shape Sculpt
  'character_sculpt',
  'sculpt_region',
  'sculpt_fill_volumetric',
  'sculpt_fill_shell',
  'sculpt_fill_tube',
  'sculpt_blend_smooth_union',
  'sculpt_color_map',

  // Stage 2: Surface Extraction
  'compiled_mesh',
  'mesh_marching_cubes',
  'mesh_dual_contouring',
  'mesh_poisson_reconstruction',
  'mesh_ball_pivoting',

  // Stage 3: Hollow + LOD
  'optimized_character',
  'character_hollow',
  'character_lod',
  'character_lod_dithered',
  'character_lod_crossfade',

  // Stage 4: Rigging
  'rigged_character',
  'skeleton_humanoid_65',
  'skeleton_custom_bone',
  'skinning_heat_diffusion',
  'skinning_geodesic_voxel',
  'skinning_neural',
  'skin_max_influences',

  // Stage 5: Facial Expression (FACS)
  'face_facs_52',
  'face_action_unit',
  'face_expression_preset',
  'face_viseme',
  'face_reactive',
  'face_idle_blink',

  // Stage 6: Materials / Clothing / Hair
  'material_subsurface',
  'material_refractive_eye',
  'material_hair_marschner',
  'clothing_baked',
  'clothing_layered_shell',
  'clothing_cloth_sim',
  'clothing_shrinkwrap',
  'clothing_wrinkle_map',
  'hair_cards',
  'hair_strands',
  'hair_guide_curves',

  // Stage 7: Lip Sync & Deploy
  'speech_viseme_15',
  'speech_emotion_overlay',
  'speech_audio_analysis',
  'deploy_web_gltf',
  'deploy_vrchat_vrm',
  'deploy_unreal_usd',
  'deploy_unity_fbx',
  'deploy_apple_usdz',
  'deploy_rpm_glb',
  'deploy_cloud_native',
] as const;

export type CharacterPipelineTraitName = (typeof CHARACTER_PIPELINE_TRAITS)[number];
