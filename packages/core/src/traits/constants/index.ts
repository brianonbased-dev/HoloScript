/**
 * VR_TRAITS Barrel Index
 *
 * Combines all per-category trait arrays into the unified VR_TRAITS constant.
 * VRTraitName is the string literal union of all trait names.
 *
 * @version 3.0.0 - Modularized into category-per-file structure
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

/**
 * Combined VR_TRAITS array - the single source of truth for all valid VR trait names.
 * Now includes 213 robotics & industrial traits (CYCLE B) + 22 scientific computing traits (Phase 1)
 * + 23 V43 AI/XR traits (Tier 1-3) + 18 enterprise multi-tenancy traits
 * + 18 analytics & observability traits.
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

  // V43 AI/XR Traits (23 traits - Tier 1-3)
  ...V43_AI_XR_TRAITS,

  // Enterprise Multi-Tenancy (18 traits)
  ...ENTERPRISE_MULTITENANCY_TRAITS,

  // Analytics & Observability (18 traits)
  ...ANALYTICS_OBSERVABILITY_TRAITS,
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
