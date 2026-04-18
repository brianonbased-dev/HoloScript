/**
 * VR_TRAITS Barrel Index
 *
 * Combines all per-category trait arrays into the unified VR_TRAITS constant.
 * VRTraitName is the string literal union of all trait names.
 *
 * Modularized into category-per-file structure.
 */

import { CORE_VR_INTERACTION_TRAITS } from './core-vr-interaction';
import { HUMANOID_AVATAR_TRAITS } from './humanoid-avatar';
import { NETWORKING_AI_TRAITS } from './networking-ai';
import { MEDIA_ANALYTICS_TRAITS } from './media-analytics';
import { SOCIAL_EFFECTS_TRAITS } from './social-effects';
import { AUDIO_TRAITS } from './audio';
import { ENVIRONMENT_INPUT_TRAITS } from './environment-input';
import { ACCESSIBILITY_TRAITS } from './accessibility';
import { VOLUMETRIC_WEBGPU_TRAITS } from './volumetric-webgpu';
import { IOT_AUTONOMOUS_AGENTS_TRAITS } from './iot-autonomous-agents';
import { INTEROP_COPRESENCE_TRAITS } from './interop-copresence';
import { GEOSPATIAL_WEB3_TRAITS } from './geospatial-web3';
import { PHYSICS_EXPANSION_TRAITS } from './physics-expansion';
import { SIMPLE_MODIFIER_TRAITS } from './simple-modifiers';
import { PARSER_CORE_UI_TRAITS } from './parser-core-ui';
import { LOCOMOTION_MOVEMENT_TRAITS } from './locomotion-movement';
import { OBJECT_INTERACTION_TRAITS } from './object-interaction';
import { RESOURCE_GATHERING_TRAITS } from './resource-gathering';
import { GAME_MECHANICS_TRAITS } from './game-mechanics';
import { VISUAL_EFFECTS_TRAITS } from './visual-effects';
import { ENVIRONMENTAL_BIOME_TRAITS } from './environmental-biome';
import { SOCIAL_COMMERCE_TRAITS } from './social-commerce';
import { INTELLIGENCE_BEHAVIOR_TRAITS } from './intelligence-behavior';
import { STATE_PERSISTENCE_TRAITS } from './state-persistence';
import { SAFETY_BOUNDARIES_TRAITS } from './safety-boundaries';
import { MUSICAL_SOUND_TRAITS } from './musical-sound';
import { MEASUREMENT_SENSING_TRAITS } from './measurement-sensing';
import { NARRATIVE_STORYTELLING_TRAITS } from './narrative-storytelling';
import { WEATHER_PARTICLES_TRAITS } from './weather-particles';
import { TRANSPORTATION_VEHICLES_TRAITS } from './transportation-vehicles';
import { CONSTRUCTION_BUILDING_TRAITS } from './construction-building';
import { NATURE_LIFE_TRAITS } from './nature-life';
import { MAGIC_FANTASY_TRAITS } from './magic-fantasy';
import { SCIFI_TECHNOLOGY_TRAITS } from './scifi-technology';
import { EMOTION_MOOD_TRAITS } from './emotion-mood';
import { MULTISENSORY_HAPTIC_TRAITS } from './multisensory-haptic';
import { PHYSICAL_AFFORDANCES_TRAITS } from './physical-affordances';
import { PROCEDURAL_GENERATION_TRAITS } from './procedural-generation';
import { NPC_ROLES_TRAITS } from './npc-roles';
import { XR_PLATFORM_TRAITS } from './xr-platform';
import { DATA_VISUALIZATION_TRAITS } from './data-visualization';
import { ACCESSIBILITY_EXTENDED_TRAITS } from './accessibility-extended';
import { SPORTS_FITNESS_TRAITS } from './sports-fitness';
import { EDUCATION_LEARNING_TRAITS } from './education-learning';
import { HEALTHCARE_MEDICAL_TRAITS } from './healthcare-medical';
import { ARCHITECTURE_REALESTATE_TRAITS } from './architecture-realestate';
import { MUSIC_PERFORMANCE_TRAITS } from './music-performance';
import { COOKING_FOOD_TRAITS } from './cooking-food';

// Semantic expansion categories
import { WATER_FLUID_TRAITS } from './water-fluid';
import { SIZE_SCALE_TRAITS } from './size-scale';
import { AGE_CONDITION_TRAITS } from './age-condition';
import { SHAPE_FORM_TRAITS } from './shape-form';
import { SURFACE_TEXTURE_TRAITS } from './surface-texture';
import { LIGHTING_TRAITS } from './lighting';
import { CONTAINERS_STORAGE_TRAITS } from './containers-storage';
import { FABRIC_CLOTH_TRAITS } from './fabric-cloth';
import { CREATURES_MYTHICAL_TRAITS } from './creatures-mythical';
import { ANIMALS_TRAITS } from './animals';
import { SIGNS_COMMUNICATION_TRAITS } from './signs-communication';
import { GEMS_MINERALS_TRAITS } from './gems-minerals';
import { WEATHER_PHENOMENA_TRAITS } from './weather-phenomena';
import { MARITIME_NAVAL_TRAITS } from './maritime-naval';
import { FURNITURE_DECOR_TRAITS } from './furniture-decor';
import { TIME_PERIOD_TRAITS } from './time-period';
import { MATERIAL_PROPERTIES_TRAITS } from './material-properties';
import { FABRICATION_DEVICES_TRAITS } from './fabrication-devices';
import { ROBOTICS_INDUSTRIAL_TRAITS } from './robotics-industrial';
import { SCIENTIFIC_COMPUTING_TRAITS } from './scientific-computing';
import { V43_AI_XR_TRAITS } from './v43-ai-xr';
import { ENTERPRISE_MULTITENANCY_TRAITS } from './enterprise-multitenancy';
import { ANALYTICS_OBSERVABILITY_TRAITS } from './analytics-observability';
import { SECURITY_CRYPTO_TRAITS } from './security-crypto';
import { RENDERING_TRAITS } from './rendering';
import { SCRIPTING_AUTOMATION_TRAITS } from './scripting-automation';
import { DATA_STORAGE_TRAITS } from './data-storage';
import { OBSERVABILITY_TRAITS } from './observability';
import { COMMUNICATION_TRAITS } from './communication';
import { ML_INFERENCE_TRAITS } from './ml-inference';
import { DEVOPS_CI_TRAITS } from './devops-ci';
import { AUTH_IDENTITY_TRAITS } from './auth-identity';
import { PAYMENT_TRAITS } from './payment';
import { MEDIA_CONTENT_TRAITS } from './media-content';
import { TESTING_QA_TRAITS } from './testing-qa';
import { WORKFLOW_BPM_TRAITS } from './workflow-bpm';
import { I18N_LOCALIZATION_TRAITS } from './i18n-localization';
import { DATA_PIPELINE_TRAITS } from './data-pipeline';
import { NOTIFICATION_ALERTING_TRAITS } from './notification-alerting';
import { SEARCH_TRAITS } from './search';
import { COMPLIANCE_GOVERNANCE_TRAITS } from './compliance-governance';
import { FILE_STORAGE_TRAITS } from './file-storage';
import { API_GATEWAY_TRAITS } from './api-gateway';
import { FEATURE_FLAGS_TRAITS } from './feature-flags';
import { AUDIT_TRAIL_TRAITS } from './audit-trail';
import { GPU_COMPUTE_TRAITS } from './gpu-compute';
import { ML_TENSOR_TRAITS } from './ml-tensor';
import { DATABASE_PERSISTENCE_TRAITS } from './database-persistence';
import { SPATIAL_ALGORITHMS_TRAITS } from './spatial-algorithms';
import { DEBUG_CINEMATIC_TRAITS } from './debug-cinematic';
import { FFI_OS_TRAITS } from './ffi-os';
import { CONCURRENCY_TRAITS } from './concurrency';
import { HOLOGRAM_MEDIA_TRAITS } from './hologram-media';
import { GAPS_PHYSICS_TRAITS } from './gaps-physics';
import { UNIVERSAL_V6_TRAITS } from './universal-service';
import { SIMULATION_DOMAIN_TRAITS } from './simulation-domains';
import { CONNECTOR_INTEGRATION_TRAITS } from './connector-integration';
import { HOLOMAP_RECONSTRUCTION_TRAITS } from './holomap-reconstruction';

// Phone Sleeve VR (smartphone-as-headset)
import { PHONE_SLEEVE_VR_TRAITS } from './mobile/phone-sleeve-vr';

// Geo-Anchored Holograms (GPS-pinned persistent scenes)
import { GEO_ANCHOR_TRAITS } from './mobile/geo-anchor';

// ARCore Geospatial API (6 traits — M.010.15)
import { GEOSPATIAL_ARCORE_TRAITS } from './mobile/geospatial';

// NPU Scene Understanding — on-device ML inference (M.010.03)
import { NPU_SCENE_TRAITS } from './mobile/npu-scene';

// Camera Hand Tracking — MediaPipe/Vision 21-joint (M.010.04)
import { CAMERA_HAND_TRACKING_TRAITS } from './mobile/camera-hand-tracking';

// Spatial Authoring — mobile creation tool (M.010.08)
import { SPATIAL_AUTHORING_TRAITS } from './mobile/spatial-authoring';

// Haptic Holographic Feedback (M.010.05)
import { HAPTIC_FEEDBACK_TRAITS } from './mobile/haptic-feedback';

// iOS Object Capture — photogrammetry (M.010.10)
import { IOS_OBJECT_CAPTURE_TRAITS } from './mobile/ios-object-capture';

// AirPods Spatial Audio (M.010.11)
import { AIRPODS_SPATIAL_AUDIO_TRAITS } from './mobile/airpods-spatial-audio';

// SharePlay Multi-User AR (M.010.12)
import { SHAREPLAY_TRAITS } from './mobile/shareplay';

// Ultra Wideband positioning (M.010.13)
import { UWB_POSITIONING_TRAITS } from './mobile/uwb-positioning';

// TrueDepth Face Tracking (M.010.14)
import { FACE_TRACKING_TRAITS } from './mobile/face-tracking';

// Android Nearby Connections (M.010.16)
import { NEARBY_CONNECTIONS_TRAITS } from './mobile/nearby-connections';

// Android Foldable Display (M.010.17)
import { FOLDABLE_DISPLAY_TRAITS } from './mobile/foldable-display';

// Samsung DeX (M.010.18)
import { SAMSUNG_DEX_TRAITS } from './mobile/samsung-dex';

// Android WebXR Chrome (M.010.19)
import { WEBXR_TRAITS } from './mobile/webxr';

// Google Lens Integration (M.010.20)
import { GOOGLE_LENS_TRAITS } from './mobile/google-lens';

// Portal AR — phone-as-portal magic window (M.010.06)
import { PORTAL_AR_TRAITS } from './mobile/portal-ar';

// LiDAR Scanner — iOS mesh capture (M.010.02a)
import { LIDAR_SCANNER_TRAITS } from './mobile/lidar-scanner';

// Depth Scanner — Android ARCore/ToF/stereo (M.010.02b)
import { DEPTH_SCANNER_TRAITS } from './mobile/depth-scanner';

// RoomPlan — iOS spatial scanning (iOS 16+)
import { ROOMPLAN_TRAITS } from './mobile/roomplan';

// Character Pipeline & GPU Geometry (Phase R4)
import { INSTANCING_GEOMETRY_TRAITS } from './instancing-geometry';
import { CHARACTER_PIPELINE_TRAITS } from './character-pipeline';
import { FACIAL_EXPRESSION_TRAITS } from './facial-expression';
import { CHARACTER_MATERIAL_TRAITS } from './character-materials';

/**
 * Combined VR_TRAITS array - the single source of truth for all valid VR trait names.
 * Now includes 213 robotics & industrial traits (CYCLE B) + 22 scientific computing traits (Phase 1)
 * + 23 V43 AI/XR traits (Tier 1-3) + 18 enterprise multi-tenancy traits
 * + 18 analytics & observability traits + 76 security & cryptography traits + 27 rendering traits
 * + 14 scripting & automation traits + 7 data & storage traits + 6 observability traits
 * + 7 communication traits + 6 ML/inference traits + 6 devops/CI traits
 * + 6 auth/identity traits + 8 payment traits (5 + 3 x402) + 4 media/content traits
 * + 5 testing/QA traits + 4 workflow/BPM traits + 4 i18n/localization traits
 * + 5 data pipeline/ETL traits + 3 notification/alerting traits + 3 search traits + 3 compliance/governance traits.
 */
export const VR_TRAITS = [
  ...CORE_VR_INTERACTION_TRAITS,
  ...HUMANOID_AVATAR_TRAITS,
  ...NETWORKING_AI_TRAITS,
  ...MEDIA_ANALYTICS_TRAITS,
  ...SOCIAL_EFFECTS_TRAITS,
  ...AUDIO_TRAITS,
  ...ENVIRONMENT_INPUT_TRAITS,
  ...ACCESSIBILITY_TRAITS,
  ...VOLUMETRIC_WEBGPU_TRAITS,
  ...IOT_AUTONOMOUS_AGENTS_TRAITS,
  ...INTEROP_COPRESENCE_TRAITS,
  ...GEOSPATIAL_WEB3_TRAITS,
  ...PHYSICS_EXPANSION_TRAITS,
  ...SIMPLE_MODIFIER_TRAITS,
  ...PARSER_CORE_UI_TRAITS,
  ...LOCOMOTION_MOVEMENT_TRAITS,
  ...OBJECT_INTERACTION_TRAITS,
  ...RESOURCE_GATHERING_TRAITS,
  ...GAME_MECHANICS_TRAITS,
  ...VISUAL_EFFECTS_TRAITS,
  ...ENVIRONMENTAL_BIOME_TRAITS,
  ...SOCIAL_COMMERCE_TRAITS,
  ...INTELLIGENCE_BEHAVIOR_TRAITS,
  ...STATE_PERSISTENCE_TRAITS,
  ...SAFETY_BOUNDARIES_TRAITS,
  ...MUSICAL_SOUND_TRAITS,
  ...MEASUREMENT_SENSING_TRAITS,
  ...NARRATIVE_STORYTELLING_TRAITS,
  ...WEATHER_PARTICLES_TRAITS,
  ...TRANSPORTATION_VEHICLES_TRAITS,
  ...CONSTRUCTION_BUILDING_TRAITS,
  ...NATURE_LIFE_TRAITS,
  ...MAGIC_FANTASY_TRAITS,
  ...SCIFI_TECHNOLOGY_TRAITS,
  ...EMOTION_MOOD_TRAITS,
  ...MULTISENSORY_HAPTIC_TRAITS,
  ...PHYSICAL_AFFORDANCES_TRAITS,
  ...PROCEDURAL_GENERATION_TRAITS,
  ...NPC_ROLES_TRAITS,
  ...XR_PLATFORM_TRAITS,
  ...DATA_VISUALIZATION_TRAITS,
  ...ACCESSIBILITY_EXTENDED_TRAITS,
  ...SPORTS_FITNESS_TRAITS,
  ...EDUCATION_LEARNING_TRAITS,
  ...HEALTHCARE_MEDICAL_TRAITS,
  ...ARCHITECTURE_REALESTATE_TRAITS,
  ...MUSIC_PERFORMANCE_TRAITS,
  ...COOKING_FOOD_TRAITS,

  // Semantic expansion
  ...WATER_FLUID_TRAITS,
  ...SIZE_SCALE_TRAITS,
  ...AGE_CONDITION_TRAITS,
  ...SHAPE_FORM_TRAITS,
  ...SURFACE_TEXTURE_TRAITS,
  ...LIGHTING_TRAITS,
  ...CONTAINERS_STORAGE_TRAITS,
  ...FABRIC_CLOTH_TRAITS,
  ...CREATURES_MYTHICAL_TRAITS,
  ...ANIMALS_TRAITS,
  ...SIGNS_COMMUNICATION_TRAITS,
  ...GEMS_MINERALS_TRAITS,
  ...WEATHER_PHENOMENA_TRAITS,
  ...MARITIME_NAVAL_TRAITS,
  ...FURNITURE_DECOR_TRAITS,
  ...TIME_PERIOD_TRAITS,
  ...MATERIAL_PROPERTIES_TRAITS,
  ...FABRICATION_DEVICES_TRAITS,

  // Robotics & Industrial (213 traits - CYCLE B)
  ...ROBOTICS_INDUSTRIAL_TRAITS,

  // Scientific Computing & Molecular Dynamics (22 traits - Phase 1)
  ...SCIENTIFIC_COMPUTING_TRAITS,

  // Simulation Domains — Thermal, Structural, Hydraulic, Saturation (38 traits)
  ...SIMULATION_DOMAIN_TRAITS,

  // V43 AI/XR Traits (23 traits - Tier 1-3)
  ...V43_AI_XR_TRAITS,

  // Enterprise Multi-Tenancy (18 traits)
  ...ENTERPRISE_MULTITENANCY_TRAITS,

  // Analytics & Observability (18 traits)
  ...ANALYTICS_OBSERVABILITY_TRAITS,

  // Security & Cryptography (76 traits)
  ...SECURITY_CRYPTO_TRAITS,

  // Rendering & Graphics (27 traits - Phase 1)
  ...RENDERING_TRAITS,

  // Scripting & Automation (14 traits)
  ...SCRIPTING_AUTOMATION_TRAITS,

  // Data & Storage (7 traits)
  ...DATA_STORAGE_TRAITS,

  // Observability — Infrastructure (6 traits)
  ...OBSERVABILITY_TRAITS,

  // Communication (7 traits)
  ...COMMUNICATION_TRAITS,

  // ML / Inference (6 traits)
  ...ML_INFERENCE_TRAITS,

  // DevOps / CI (6 traits)
  ...DEVOPS_CI_TRAITS,

  // Auth / Identity (6 traits)
  ...AUTH_IDENTITY_TRAITS,

  // Payment (5 traits)
  ...PAYMENT_TRAITS,

  // Media / Content (4 traits)
  ...MEDIA_CONTENT_TRAITS,

  // Testing / QA (5 traits)
  ...TESTING_QA_TRAITS,

  // Workflow / BPM (4 traits)
  ...WORKFLOW_BPM_TRAITS,

  // i18n / Localization (4 traits)
  ...I18N_LOCALIZATION_TRAITS,

  // Data Pipeline / ETL (5 traits)
  ...DATA_PIPELINE_TRAITS,

  // Notification / Alerting (3 traits)
  ...NOTIFICATION_ALERTING_TRAITS,

  // Search (3 traits)
  ...SEARCH_TRAITS,

  // Compliance / Governance (3 traits)
  ...COMPLIANCE_GOVERNANCE_TRAITS,

  // File Storage (3 traits)
  ...FILE_STORAGE_TRAITS,

  // API Gateway (3 traits)
  ...API_GATEWAY_TRAITS,

  // Feature Flags (2 new traits — feature_flag already in devops-ci)
  ...FEATURE_FLAGS_TRAITS,

  // Audit Trail (2 new traits — audit_log already in observability)
  ...AUDIT_TRAIL_TRAITS,

  // GPU Compute / Shaders (4 traits)
  ...GPU_COMPUTE_TRAITS,

  // ML / Tensor Ops (3 new traits — model_load/inference/embedding already exist)
  ...ML_TENSOR_TRAITS,

  // Database / Persistence (4 traits)
  ...DATABASE_PERSISTENCE_TRAITS,

  // Spatial Algorithms (3 new traits — voronoi already exists)
  ...SPATIAL_ALGORITHMS_TRAITS,

  // Debug / Cinematic (4 traits)
  ...DEBUG_CINEMATIC_TRAITS,

  // FFI / OS Bindings (4 traits)
  ...FFI_OS_TRAITS,

  // Formal Verification / Concurrency (4 traits)
  ...CONCURRENCY_TRAITS,

  // Hologram Media Pipeline (13 traits)
  ...HOLOGRAM_MEDIA_TRAITS,

  // GAPS Feature Roadmap — Phase 1 (14 traits)
  ...GAPS_PHYSICS_TRAITS,

  // v6 Universal Semantic Platform (35 traits)
  ...UNIVERSAL_V6_TRAITS,

  // GPU Geometry & Instancing (32 traits — Phase R4)
  ...INSTANCING_GEOMETRY_TRAITS,

  // Character Pipeline (42 traits — Phase R4)
  ...CHARACTER_PIPELINE_TRAITS,

  // Facial Expression / FACS (75 traits — Phase R4)
  ...FACIAL_EXPRESSION_TRAITS,

  // Character Materials — SSS, Eye, Hair, Cloth (38 traits — Phase R4)
  ...CHARACTER_MATERIAL_TRAITS,

  // Phone Sleeve VR — smartphone-as-headset (25 traits)
  ...PHONE_SLEEVE_VR_TRAITS,

  // Geo-Anchored Holograms — GPS-pinned persistent scenes (12 traits)
  ...GEO_ANCHOR_TRAITS,

  // ARCore Geospatial API — VPS street-level geo-anchoring (6 traits — M.010.15)
  ...GEOSPATIAL_ARCORE_TRAITS,

  // NPU Scene Understanding — on-device ML inference (8 traits — M.010.03)
  ...NPU_SCENE_TRAITS,

  // Camera Hand Tracking — MediaPipe/Vision (9 traits — M.010.04)
  ...CAMERA_HAND_TRACKING_TRAITS,

  // Portal AR — phone-as-portal magic window (15 traits — M.010.06)
  ...PORTAL_AR_TRAITS,

  // LiDAR Scanner — iOS mesh capture (11 traits — M.010.02a)
  ...LIDAR_SCANNER_TRAITS,

  // Depth Scanner — Android ARCore/ToF/stereo (10 traits — M.010.02b)
  ...DEPTH_SCANNER_TRAITS,

  // RoomPlan — iOS spatial scanning (22 traits — M.010.09)
  ...ROOMPLAN_TRAITS,

  // Spatial Authoring — mobile creation tool (5 traits — M.010.08)
  ...SPATIAL_AUTHORING_TRAITS,

  // Haptic Holographic Feedback (11 traits — M.010.05)
  ...HAPTIC_FEEDBACK_TRAITS,

  // iOS Object Capture — photogrammetry (8 traits — M.010.10)
  ...IOS_OBJECT_CAPTURE_TRAITS,

  // AirPods Spatial Audio (7 traits — M.010.11)
  ...AIRPODS_SPATIAL_AUDIO_TRAITS,

  // SharePlay Multi-User AR (9 traits — M.010.12)
  ...SHAREPLAY_TRAITS,

  // Ultra Wideband positioning (6 traits — M.010.13)
  ...UWB_POSITIONING_TRAITS,

  // TrueDepth Face Tracking (11 traits — M.010.14)
  ...FACE_TRACKING_TRAITS,

  // Android Nearby Connections (9 traits — M.010.16)
  ...NEARBY_CONNECTIONS_TRAITS,

  // Android Foldable Display (6 traits — M.010.17)
  ...FOLDABLE_DISPLAY_TRAITS,

  // Samsung DeX (5 traits — M.010.18)
  ...SAMSUNG_DEX_TRAITS,

  // Android WebXR Chrome (11 traits — M.010.19)
  ...WEBXR_TRAITS,

  // Google Lens (7 traits — M.010.20)
  ...GOOGLE_LENS_TRAITS,

  // HoloMap — native reconstruction session traits (5 traits — Sprint 1)
  ...HOLOMAP_RECONSTRUCTION_TRAITS,

  // Connector Integration (4 traits)
  ...CONNECTOR_INTEGRATION_TRAITS,
] as const;


/**
 * String literal union type of all valid VR trait names.
 */
export type VRTraitName = (typeof VR_TRAITS)[number];

// Re-export all category arrays and types for granular access
export { CORE_VR_INTERACTION_TRAITS } from './core-vr-interaction';
export { HUMANOID_AVATAR_TRAITS } from './humanoid-avatar';
export { NETWORKING_AI_TRAITS } from './networking-ai';
export { MEDIA_ANALYTICS_TRAITS } from './media-analytics';
export { SOCIAL_EFFECTS_TRAITS } from './social-effects';
export { AUDIO_TRAITS } from './audio';
export { ENVIRONMENT_INPUT_TRAITS } from './environment-input';
export { ACCESSIBILITY_TRAITS } from './accessibility';
export { VOLUMETRIC_WEBGPU_TRAITS } from './volumetric-webgpu';
export { IOT_AUTONOMOUS_AGENTS_TRAITS } from './iot-autonomous-agents';
export { INTEROP_COPRESENCE_TRAITS } from './interop-copresence';
export { GEOSPATIAL_WEB3_TRAITS } from './geospatial-web3';
export { PHYSICS_EXPANSION_TRAITS } from './physics-expansion';
export { SIMPLE_MODIFIER_TRAITS } from './simple-modifiers';
export { PARSER_CORE_UI_TRAITS } from './parser-core-ui';
export { LOCOMOTION_MOVEMENT_TRAITS } from './locomotion-movement';
export { OBJECT_INTERACTION_TRAITS } from './object-interaction';
export { RESOURCE_GATHERING_TRAITS } from './resource-gathering';
export { GAME_MECHANICS_TRAITS } from './game-mechanics';
export { VISUAL_EFFECTS_TRAITS } from './visual-effects';
export { ENVIRONMENTAL_BIOME_TRAITS } from './environmental-biome';
export { SOCIAL_COMMERCE_TRAITS } from './social-commerce';
export { INTELLIGENCE_BEHAVIOR_TRAITS } from './intelligence-behavior';
export { STATE_PERSISTENCE_TRAITS } from './state-persistence';
export { SAFETY_BOUNDARIES_TRAITS } from './safety-boundaries';
export { MUSICAL_SOUND_TRAITS } from './musical-sound';
export { MEASUREMENT_SENSING_TRAITS } from './measurement-sensing';
export { NARRATIVE_STORYTELLING_TRAITS } from './narrative-storytelling';
export { WEATHER_PARTICLES_TRAITS } from './weather-particles';
export { TRANSPORTATION_VEHICLES_TRAITS } from './transportation-vehicles';
export { CONSTRUCTION_BUILDING_TRAITS } from './construction-building';
export { NATURE_LIFE_TRAITS } from './nature-life';
export { MAGIC_FANTASY_TRAITS } from './magic-fantasy';
export { SCIFI_TECHNOLOGY_TRAITS } from './scifi-technology';
export { EMOTION_MOOD_TRAITS } from './emotion-mood';
export { MULTISENSORY_HAPTIC_TRAITS } from './multisensory-haptic';
export { PHYSICAL_AFFORDANCES_TRAITS } from './physical-affordances';
export { PROCEDURAL_GENERATION_TRAITS } from './procedural-generation';
export { NPC_ROLES_TRAITS } from './npc-roles';
export { XR_PLATFORM_TRAITS } from './xr-platform';
export { DATA_VISUALIZATION_TRAITS } from './data-visualization';
export { ACCESSIBILITY_EXTENDED_TRAITS } from './accessibility-extended';
export { SPORTS_FITNESS_TRAITS } from './sports-fitness';
export { EDUCATION_LEARNING_TRAITS } from './education-learning';
export { HEALTHCARE_MEDICAL_TRAITS } from './healthcare-medical';
export { ARCHITECTURE_REALESTATE_TRAITS } from './architecture-realestate';
export { MUSIC_PERFORMANCE_TRAITS } from './music-performance';
export { COOKING_FOOD_TRAITS } from './cooking-food';

// Semantic expansion
export { WATER_FLUID_TRAITS } from './water-fluid';
export { SIZE_SCALE_TRAITS } from './size-scale';
export { AGE_CONDITION_TRAITS } from './age-condition';
export { SHAPE_FORM_TRAITS } from './shape-form';
export { SURFACE_TEXTURE_TRAITS } from './surface-texture';
export { LIGHTING_TRAITS } from './lighting';
export { CONTAINERS_STORAGE_TRAITS } from './containers-storage';
export { FABRIC_CLOTH_TRAITS } from './fabric-cloth';
export { CREATURES_MYTHICAL_TRAITS } from './creatures-mythical';
export { ANIMALS_TRAITS } from './animals';
export { SIGNS_COMMUNICATION_TRAITS } from './signs-communication';
export { GEMS_MINERALS_TRAITS } from './gems-minerals';
export { WEATHER_PHENOMENA_TRAITS } from './weather-phenomena';
export { MARITIME_NAVAL_TRAITS } from './maritime-naval';
export { FURNITURE_DECOR_TRAITS } from './furniture-decor';
export { TIME_PERIOD_TRAITS } from './time-period';
export { MATERIAL_PROPERTIES_TRAITS } from './material-properties';
export { FABRICATION_DEVICES_TRAITS } from './fabrication-devices';
export {
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
} from './robotics-industrial';

// Scientific Computing & Molecular Dynamics (Phase 1)
export {
  SCIENTIFIC_COMPUTING_TRAITS,
  type ScientificComputingTraitName,
} from './scientific-computing';

// Simulation Domains — Thermal, Structural, Hydraulic, Saturation
export {
  SIMULATION_DOMAIN_TRAITS,
  type SimulationDomainTraitName,
} from './simulation-domains';

// V43 AI/XR Traits (Tier 1-3)
export { V43_AI_XR_TRAITS } from './v43-ai-xr';

// Enterprise Multi-Tenancy
export {
  ENTERPRISE_MULTITENANCY_TRAITS,
  type EnterpriseMultitenancyTraitName,
} from './enterprise-multitenancy';

// Analytics & Observability
export {
  ANALYTICS_OBSERVABILITY_TRAITS,
  type AnalyticsObservabilityTraitName,
} from './analytics-observability';

// Security & Cryptography
export { SECURITY_CRYPTO_TRAITS } from './security-crypto';

// Rendering & Graphics (Phase 1)
export { RENDERING_TRAITS, type RenderingTraitName } from './rendering';

// Scripting & Automation
export {
  SCRIPTING_AUTOMATION_TRAITS,
  type ScriptingAutomationTraitName,
} from './scripting-automation';

// Data & Storage
export { DATA_STORAGE_TRAITS, type DataStorageTraitName } from './data-storage';

// Observability (Infrastructure)
export { OBSERVABILITY_TRAITS, type ObservabilityTraitName } from './observability';

// Communication
export { COMMUNICATION_TRAITS, type CommunicationTraitName } from './communication';

// ML / Inference
export { ML_INFERENCE_TRAITS, type MLInferenceTraitName } from './ml-inference';

// DevOps / CI
export { DEVOPS_CI_TRAITS, type DevOpsCITraitName } from './devops-ci';

// Auth / Identity
export { AUTH_IDENTITY_TRAITS, type AuthIdentityTraitName } from './auth-identity';

// Payment
export { PAYMENT_TRAITS, type PaymentTraitName } from './payment';

// Media / Content
export { MEDIA_CONTENT_TRAITS, type MediaContentTraitName } from './media-content';

// Testing / QA
export { TESTING_QA_TRAITS, type TestingQATraitName } from './testing-qa';

// Workflow / BPM
export { WORKFLOW_BPM_TRAITS, type WorkflowBPMTraitName } from './workflow-bpm';

// i18n / Localization
export { I18N_LOCALIZATION_TRAITS, type I18NLocalizationTraitName } from './i18n-localization';

// Data Pipeline / ETL
export { DATA_PIPELINE_TRAITS, type DataPipelineTraitName } from './data-pipeline';

// Notification / Alerting
export {
  NOTIFICATION_ALERTING_TRAITS,
  type NotificationAlertingTraitName,
} from './notification-alerting';

// Search
export { SEARCH_TRAITS, type SearchTraitName } from './search';

// Compliance / Governance
export {
  COMPLIANCE_GOVERNANCE_TRAITS,
  type ComplianceGovernanceTraitName,
} from './compliance-governance';

// File Storage
export { FILE_STORAGE_TRAITS, type FileStorageTraitName } from './file-storage';

// API Gateway
export { API_GATEWAY_TRAITS, type ApiGatewayTraitName } from './api-gateway';

// Feature Flags
export { FEATURE_FLAGS_TRAITS, type FeatureFlagsTraitName } from './feature-flags';

// Audit Trail
export { AUDIT_TRAIL_TRAITS, type AuditTrailTraitName } from './audit-trail';

// GPU Compute
export { GPU_COMPUTE_TRAITS, type GpuComputeTraitName } from './gpu-compute';

// ML / Tensor
export { ML_TENSOR_TRAITS, type MlTensorTraitName } from './ml-tensor';

// Database / Persistence
export {
  DATABASE_PERSISTENCE_TRAITS,
  type DatabasePersistenceTraitName,
} from './database-persistence';

// Spatial Algorithms
export { SPATIAL_ALGORITHMS_TRAITS, type SpatialAlgorithmsTraitName } from './spatial-algorithms';

// Debug / Cinematic
export { DEBUG_CINEMATIC_TRAITS, type DebugCinematicTraitName } from './debug-cinematic';

// FFI / OS
export { FFI_OS_TRAITS, type FfiOsTraitName } from './ffi-os';

// Concurrency
export { CONCURRENCY_TRAITS, type ConcurrencyTraitName } from './concurrency';

// Hologram Media Pipeline
export { HOLOGRAM_MEDIA_TRAITS } from './hologram-media';

// GAPS Feature Roadmap — Phase 1
export { GAPS_PHYSICS_TRAITS } from './gaps-physics';

// GPU Geometry & Instancing (Phase R4)
export {
  INSTANCING_GEOMETRY_TRAITS,
  type InstancingGeometryTraitName,
} from './instancing-geometry';

// Character Pipeline (Phase R4)
export { CHARACTER_PIPELINE_TRAITS, type CharacterPipelineTraitName } from './character-pipeline';

// Facial Expression / FACS (Phase R4)
export { FACIAL_EXPRESSION_TRAITS, type FacialExpressionTraitName } from './facial-expression';

// Character Materials (Phase R4)
export { CHARACTER_MATERIAL_TRAITS, type CharacterMaterialTraitName } from './character-materials';

// Phone Sleeve VR (25 traits)
export { PHONE_SLEEVE_VR_TRAITS, type PhoneSleeveVRTraitName } from './mobile/phone-sleeve-vr';

// Geo-Anchored Holograms (12 traits)
export { GEO_ANCHOR_TRAITS, type GeoAnchorTraitName } from './mobile/geo-anchor';

// v6 Universal Semantic Platform (35 traits)
export {
  UNIVERSAL_V6_TRAITS,
  UNIVERSAL_SERVICE_TRAITS,
  UNIVERSAL_CONTRACT_TRAITS,
  UNIVERSAL_DATA_TRAITS,
  UNIVERSAL_NETWORK_TRAITS,
  UNIVERSAL_PIPELINE_TRAITS,
  UNIVERSAL_METRIC_TRAITS,
  UNIVERSAL_CONTAINER_TRAITS,
  UNIVERSAL_RESILIENCE_TRAITS,
  type UniversalV6TraitName,
} from './universal-service';

// ARCore Geospatial API (6 traits — M.010.15)
export { GEOSPATIAL_ARCORE_TRAITS, type GeospatialARCoreTraitName } from './mobile/geospatial';

// NPU Scene Understanding — on-device ML inference (8 traits — M.010.03)
export { NPU_SCENE_TRAITS, type NPUSceneTraitName } from './mobile/npu-scene';

// Camera Hand Tracking (9 traits — M.010.04)
export {
  CAMERA_HAND_TRACKING_TRAITS,
  type CameraHandTrackingTraitName,
} from './mobile/camera-hand-tracking';

// Portal AR — phone-as-portal magic window (15 traits — M.010.06)
export { PORTAL_AR_TRAITS, type PortalARTraitName } from './mobile/portal-ar';

// LiDAR Scanner — iOS mesh capture (11 traits — M.010.02a)
export { LIDAR_SCANNER_TRAITS, type LiDARScannerTraitName } from './mobile/lidar-scanner';

// Depth Scanner — Android ARCore/ToF/stereo (10 traits — M.010.02b)
export { DEPTH_SCANNER_TRAITS, type DepthScannerTraitName } from './mobile/depth-scanner';

// RoomPlan — iOS spatial scanning (22 traits — M.010.09)
export { ROOMPLAN_TRAITS, type RoomPlanTraitName } from './mobile/roomplan';

// Spatial Authoring (5 traits — M.010.08)
export {
  SPATIAL_AUTHORING_TRAITS,
  type SpatialAuthoringTraitName,
} from './mobile/spatial-authoring';

// Haptic Holographic Feedback (11 traits — M.010.05)
export { HAPTIC_FEEDBACK_TRAITS, type HapticFeedbackTraitName } from './mobile/haptic-feedback';

// iOS Object Capture (8 traits — M.010.10)
export {
  IOS_OBJECT_CAPTURE_TRAITS,
  type IOSObjectCaptureTraitName,
} from './mobile/ios-object-capture';

// AirPods Spatial Audio (7 traits — M.010.11)
export {
  AIRPODS_SPATIAL_AUDIO_TRAITS,
  type AirPodsSpatialAudioTraitName,
} from './mobile/airpods-spatial-audio';

// SharePlay Multi-User AR (9 traits — M.010.12)
export { SHAREPLAY_TRAITS, type SharePlayTraitName } from './mobile/shareplay';

// Ultra Wideband positioning (6 traits — M.010.13)
export { UWB_POSITIONING_TRAITS, type UWBPositioningTraitName } from './mobile/uwb-positioning';

// TrueDepth Face Tracking (11 traits — M.010.14)
export { FACE_TRACKING_TRAITS, type FaceTrackingTraitName } from './mobile/face-tracking';

// Android Nearby Connections (9 traits — M.010.16)
export {
  NEARBY_CONNECTIONS_TRAITS,
  type NearbyConnectionsTraitName,
} from './mobile/nearby-connections';

// Android Foldable Display (6 traits — M.010.17)
export { FOLDABLE_DISPLAY_TRAITS, type FoldableDisplayTraitName } from './mobile/foldable-display';

// Samsung DeX (5 traits — M.010.18)
export { SAMSUNG_DEX_TRAITS, type SamsungDeXTraitName } from './mobile/samsung-dex';

// Android WebXR Chrome (11 traits — M.010.19)
export { WEBXR_TRAITS, type WebXRTraitName } from './mobile/webxr';

// Google Lens (7 traits — M.010.20)
export { GOOGLE_LENS_TRAITS, type GoogleLensTraitName } from './mobile/google-lens';

// Connector Integration
export {
  CONNECTOR_INTEGRATION_TRAITS,
  KNOWN_CONNECTORS,
  CONNECTOR_ENV_REQUIREMENTS,
  CONNECTOR_PACKAGES,
  CONNECTOR_CLASSES,
  type ConnectorIntegrationTraitName,
  type KnownConnector,
} from './connector-integration';

