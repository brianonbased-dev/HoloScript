// Shared Constants for HoloScript Core
// Used by Parser, Runtime, and Language Server
//
// VR_TRAITS is now modularized into category-per-file under ./traits/constants/
// Import individual categories (e.g., AUDIO_TRAITS) or the combined VR_TRAITS.

export { VR_TRAITS, type VRTraitName } from './traits/constants';

// Re-export all category arrays for granular access
export {
  CORE_VR_INTERACTION_TRAITS,
  HUMANOID_AVATAR_TRAITS,
  NETWORKING_AI_TRAITS,
  MEDIA_ANALYTICS_TRAITS,
  SOCIAL_EFFECTS_TRAITS,
  AUDIO_TRAITS,
  ENVIRONMENT_INPUT_TRAITS,
  ACCESSIBILITY_TRAITS,
  VOLUMETRIC_WEBGPU_TRAITS,
  IOT_AUTONOMOUS_AGENTS_TRAITS,
  INTEROP_COPRESENCE_TRAITS,
  GEOSPATIAL_WEB3_TRAITS,
  PHYSICS_EXPANSION_TRAITS,
  SIMPLE_MODIFIER_TRAITS,
  PARSER_CORE_UI_TRAITS,
  LOCOMOTION_MOVEMENT_TRAITS,
  OBJECT_INTERACTION_TRAITS,
  RESOURCE_GATHERING_TRAITS,
  GAME_MECHANICS_TRAITS,
  VISUAL_EFFECTS_TRAITS,
  ENVIRONMENTAL_BIOME_TRAITS,
  SOCIAL_COMMERCE_TRAITS,
  INTELLIGENCE_BEHAVIOR_TRAITS,
  STATE_PERSISTENCE_TRAITS,
  SAFETY_BOUNDARIES_TRAITS,
  MUSICAL_SOUND_TRAITS,
  MEASUREMENT_SENSING_TRAITS,
  NARRATIVE_STORYTELLING_TRAITS,
  WEATHER_PARTICLES_TRAITS,
  TRANSPORTATION_VEHICLES_TRAITS,
  CONSTRUCTION_BUILDING_TRAITS,
  NATURE_LIFE_TRAITS,
  MAGIC_FANTASY_TRAITS,
  SCIFI_TECHNOLOGY_TRAITS,
  EMOTION_MOOD_TRAITS,
  MULTISENSORY_HAPTIC_TRAITS,
  PHYSICAL_AFFORDANCES_TRAITS,
  PROCEDURAL_GENERATION_TRAITS,
  NPC_ROLES_TRAITS,
  XR_PLATFORM_TRAITS,
  DATA_VISUALIZATION_TRAITS,
  ACCESSIBILITY_EXTENDED_TRAITS,
  SPORTS_FITNESS_TRAITS,
  EDUCATION_LEARNING_TRAITS,
  HEALTHCARE_MEDICAL_TRAITS,
  ARCHITECTURE_REALESTATE_TRAITS,
  MUSIC_PERFORMANCE_TRAITS,
  COOKING_FOOD_TRAITS,
  WATER_FLUID_TRAITS,
  SIZE_SCALE_TRAITS,
  AGE_CONDITION_TRAITS,
  SHAPE_FORM_TRAITS,
  SURFACE_TEXTURE_TRAITS,
  LIGHTING_TRAITS,
  CONTAINERS_STORAGE_TRAITS,
  FABRIC_CLOTH_TRAITS,
  CREATURES_MYTHICAL_TRAITS,
  ANIMALS_TRAITS,
  SIGNS_COMMUNICATION_TRAITS,
  GEMS_MINERALS_TRAITS,
  WEATHER_PHENOMENA_TRAITS,
  MARITIME_NAVAL_TRAITS,
  FURNITURE_DECOR_TRAITS,
  TIME_PERIOD_TRAITS,
  MATERIAL_PROPERTIES_TRAITS,
  ROBOTICS_INDUSTRIAL_TRAITS,
  JOINT_TYPE_TRAITS,
  JOINT_PROPERTY_TRAITS,
  JOINT_CONTROL_TRAITS,
  TRANSMISSION_TRAITS,
  MOTOR_TYPE_TRAITS,
  MOTOR_FEEDBACK_TRAITS,
  FORCE_TORQUE_TRAITS,
  VISION_TRAITS,
  RANGE_SENSING_TRAITS,
  INERTIAL_POSITION_TRAITS,
  ENVIRONMENTAL_SENSOR_TRAITS,
  GRIPPER_TRAITS,
  TOOL_INTERFACE_TRAITS,
  TOOL_TRAITS,
  MOBILE_BASE_TRAITS,
  LEGGED_TRAITS,
  AERIAL_AQUATIC_TRAITS,
  CONTROLLER_TRAITS,
  PLANNING_TRAITS,
  SAFETY_TRAITS,
  STANDARDS_TRAITS,
  POWER_TRAITS,
  PROTOCOL_TRAITS,
  CONNECTIVITY_TRAITS,
} from './traits/constants';

// ============================================================================
// Structural Directives (non-trait directives that define blocks)
// ============================================================================

export const STRUCTURAL_DIRECTIVES = [
  // Asset & Manifest
  'manifest',
  'asset',
  // Semantic Annotations
  'semantic',
  'annotate',
  'semantic_ref',
  'bindings',
  'artwork_metadata',
  'npc_behavior',
  // World Definition
  'world_metadata',
  'world_config',
  'zones',
  'spawn_points',
  // Environment Lighting
  'skybox',
  'ambient_light',
  'directional_light',
  'fog',
  // Advanced Simulation & AI
  'time_zones',
  'reality_capture',
  'reality_mesh',
  'reality_blend',
  'diminished_reality',
  'reality_portals',
  'reality_effects',
  'consciousness_model',
  'global_workspace',
  'attention_schema',
  'predictive_mind',
  'information_integration',
  'qualia_generator',
  'swarm_config',
  'minimal_brain',
  'rules',
  'pheromone_system',
  'emergence_detector',
  'collective_memory',
  'swarm_optimization',
  'time_engine',
  'time_buffer',
  'time_abilities',
  'paradox_prevention',
  'knowledge_integration',
  'neural_device',
  'signal_processor',
  'decoder',
  'thought_mapping',
  'haptic_feedback',
  'visual_prosthesis',
  'memory_interface',
  'affective_computing',
  'quantum_backend',
  'quantum_rng',
  'quantum_optimization',
  'quantum_ml',
  'quantum_simulation',
  'quantum_crypto',
] as const;

export type StructuralDirectiveName = (typeof STRUCTURAL_DIRECTIVES)[number];

export const LIFECYCLE_HOOKS = [
  // Standard lifecycle
  'on_mount',
  'on_unmount',
  'on_update',
  'on_data_update',
  'on_tick',
  'on_activate',
  'on_deactivate',
  'on_detected',

  // VR lifecycle
  'on_grab',
  'on_release',
  'on_hover_enter',
  'on_hover_exit',
  'on_point_enter',
  'on_point_exit',
  'on_collision',
  'on_trigger_enter',
  'on_trigger_exit',
  'on_click',
  'on_double_click',

  // Controller hooks
  'on_controller_button',
  'on_trigger_hold',
  'on_trigger_release',
  'on_grip_hold',
  'on_grip_release',

  // Stretchable/Moldable hooks
  'on_stretch',
  'on_sculpt',

  // Humanoid/Avatar hooks
  'on_pose_change',
  'on_expression_change',
  'on_gesture',
  'on_speak',
  'on_pose_save',
  'on_morph_change',

  // Media Production hooks
  'on_record_start',
  'on_record_stop',
  'on_record_pause',
  'on_stream_start',
  'on_stream_stop',
  'on_viewer_join',
  'on_viewer_leave',
  'on_chat_message',
  'on_camera_switch',
  'on_video_end',
  'on_video_error',

  // Analytics hooks
  'on_track_event',
  'on_survey_start',
  'on_survey_complete',
  'on_survey_skip',
  'on_variant_assigned',
  'on_conversion',
  'on_hotspot_detected',

  // Social hooks
  'on_share',
  'on_share_complete',
  'on_embed',
  'on_scan',
  'on_user_join',
  'on_user_leave',
  'on_draw_stroke',
  'on_object_lock',
  'on_object_unlock',

  // Effects hooks
  'on_particle_spawn',
  'on_particle_death',
  'on_transition_start',
  'on_transition_complete',
  'on_filter_change',

  // Audio hooks
  'on_audio_start',
  'on_audio_end',
  'on_voice_command',
  'on_speech_start',
  'on_speech_end',
  'on_beat',
  'on_frequency_peak',

  // AI hooks
  'on_narration_start',
  'on_narration_end',
  'on_user_question',
  'on_response_ready',
  'on_emotion_change',
  'on_generation_complete',

  // Timeline hooks
  'on_timeline_start',
  'on_timeline_complete',
  'on_keyframe_hit',
  'on_keyframe_add',
  'on_beat_sync',
  'on_move_complete',

  // Environment Understanding hooks
  'on_plane_detected',
  'on_plane_lost',
  'on_plane_updated',
  'on_mesh_detected',
  'on_mesh_updated',
  'on_anchor_created',
  'on_anchor_resolved',
  'on_anchor_lost',
  'on_anchor_shared',
  'on_light_estimated',
  'on_occlusion_updated',

  // Input Modality hooks
  'on_gaze_enter',
  'on_gaze_exit',
  'on_gaze_dwell',
  'on_hand_gesture',
  'on_hand_pinch',
  'on_hand_lost',
  'on_body_pose_update',
  'on_face_expression',
  'on_controller_vibrate',
  'on_accessory_input',

  // Accessibility hooks
  'on_accessibility_announce',
  'on_subtitle_display',
  'on_magnify',
  'on_contrast_change',
  'on_motion_reduce',
  'on_screen_reader_focus',
  'on_sonification_update',

  // Gaussian Splatting & Volumetric hooks
  'on_splat_loaded',
  'on_nerf_ready',
  'on_volume_frame',
  'on_point_cloud_loaded',
  'on_capture_complete',

  // WebGPU Compute hooks
  'on_compute_complete',
  'on_buffer_ready',
  'on_gpu_error',

  // Digital Twin & IoT hooks
  'on_sensor_update',
  'on_data_change',
  'on_alert_triggered',
  'on_twin_sync',
  'on_heatmap_update',

  // Autonomous Agent hooks
  'on_goal_completed',
  'on_goal_failed',
  'on_perception_change',
  'on_emotion_shift',
  'on_faction_change',
  'on_patrol_waypoint',
  'on_llm_response',
  'on_memory_recalled',
  'on_dialogue_start',
  'on_dialogue_end',

  // Advanced Spatial Audio hooks
  'on_reverb_enter',
  'on_reverb_exit',
  'on_audio_occluded',
  'on_audio_portal_enter',

  // OpenUSD & Interoperability hooks
  'on_asset_loaded',
  'on_format_converted',
  'on_scene_composed',

  // Co-Presence & Shared Experience hooks
  'on_co_presence_joined',
  'on_co_presence_left',
  'on_voice_proximity_change',
  'on_role_change',
  'on_spectator_join',
  'on_avatar_sync',

  // Geospatial & AR Cloud hooks
  'on_vps_localized',
  'on_poi_proximity',
  'on_terrain_resolved',
  'on_rooftop_resolved',

  // Web3 & Ownership hooks
  'on_wallet_connected',
  'on_token_verified',
  'on_nft_transferred',
  'on_purchase_complete',
  'on_asset_ported',

  // Physics Expansion hooks
  'on_cloth_tear',
  'on_fluid_splash',
  'on_soft_body_deform',
  'on_rope_snap',
  'on_wind_change',
  'on_submerge',
  'on_destruction_complete',
] as const;

export type LifecycleHookName = (typeof LIFECYCLE_HOOKS)[number];
