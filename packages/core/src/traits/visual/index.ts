/**
 * Trait Visual System — barrel export and auto-registration.
 *
 * Importing this module registers all preset visual configs into
 * the TraitVisualRegistry singleton, making them available to the
 * R3FCompiler and future compilers.
 */

export { TraitVisualRegistry } from './TraitVisualRegistry';
export type { TraitVisualConfig, R3FMaterialProps, VisualLayer } from './types';
export { VISUAL_LAYER_PRIORITY } from './types';

// Preset data re-exports (original 12)
export { MATERIAL_PROPERTIES_VISUALS } from './presets/material-properties.visual';
export { SURFACE_TEXTURE_VISUALS } from './presets/surface-texture.visual';
export { LIGHTING_VISUALS } from './presets/lighting.visual';
export { GEMS_MINERALS_VISUALS } from './presets/gems-minerals.visual';
export { FABRIC_CLOTH_VISUALS } from './presets/fabric-cloth.visual';
export { VISUAL_EFFECTS_VISUALS } from './presets/visual-effects.visual';
export { AGE_CONDITION_VISUALS } from './presets/age-condition.visual';
export { WATER_FLUID_VISUALS } from './presets/water-fluid.visual';
export { WEATHER_PHENOMENA_VISUALS } from './presets/weather-phenomena.visual';
export { EMOTION_MOOD_VISUALS } from './presets/emotion-mood.visual';
export { SIZE_SCALE_VISUALS } from './presets/size-scale.visual';
export { ENVIRONMENTAL_BIOME_VISUALS } from './presets/environmental-biome.visual';

// Preset data re-exports (expansion wave 1)
export { MAGIC_FANTASY_VISUALS } from './presets/magic-fantasy.visual';
export { SCIFI_TECHNOLOGY_VISUALS } from './presets/scifi-technology.visual';
export { CREATURES_MYTHICAL_VISUALS } from './presets/creatures-mythical.visual';
export { NATURE_LIFE_VISUALS } from './presets/nature-life.visual';
export { FURNITURE_DECOR_VISUALS } from './presets/furniture-decor.visual';
export { CONSTRUCTION_BUILDING_VISUALS } from './presets/construction-building.visual';
export { CONTAINERS_STORAGE_VISUALS } from './presets/containers-storage.visual';
export { SHAPE_FORM_VISUALS } from './presets/shape-form.visual';
export { ANIMALS_VISUALS } from './presets/animals.visual';
export { MARITIME_NAVAL_VISUALS } from './presets/maritime-naval.visual';
export { TIME_PERIOD_VISUALS } from './presets/time-period.visual';

// Preset data re-exports (expansion wave 2 — full coverage)
export { ACCESSIBILITY_VISUALS } from './presets/accessibility.visual';
export { ACCESSIBILITY_EXTENDED_VISUALS } from './presets/accessibility-extended.visual';
export { ARCHITECTURE_REALESTATE_VISUALS } from './presets/architecture-realestate.visual';
export { AUDIO_VISUALS } from './presets/audio.visual';
export { COOKING_FOOD_VISUALS } from './presets/cooking-food.visual';
export { CORE_VR_INTERACTION_VISUALS } from './presets/core-vr-interaction.visual';
export { DATA_VISUALIZATION_VISUALS } from './presets/data-visualization.visual';
export { EDUCATION_LEARNING_VISUALS } from './presets/education-learning.visual';
export { ENVIRONMENT_INPUT_VISUALS } from './presets/environment-input.visual';
export { GAME_MECHANICS_VISUALS } from './presets/game-mechanics.visual';
export { GEOSPATIAL_WEB3_VISUALS } from './presets/geospatial-web3.visual';
export { HEALTHCARE_MEDICAL_VISUALS } from './presets/healthcare-medical.visual';
export { HUMANOID_AVATAR_VISUALS } from './presets/humanoid-avatar.visual';
export { INTELLIGENCE_BEHAVIOR_VISUALS } from './presets/intelligence-behavior.visual';
export { INTEROP_COPRESENCE_VISUALS } from './presets/interop-copresence.visual';
export { IOT_AUTONOMOUS_AGENTS_VISUALS } from './presets/iot-autonomous-agents.visual';
export { LOCOMOTION_MOVEMENT_VISUALS } from './presets/locomotion-movement.visual';
export { MEASUREMENT_SENSING_VISUALS } from './presets/measurement-sensing.visual';
export { MEDIA_ANALYTICS_VISUALS } from './presets/media-analytics.visual';
export { MULTISENSORY_HAPTIC_VISUALS } from './presets/multisensory-haptic.visual';
export { MUSICAL_SOUND_VISUALS } from './presets/musical-sound.visual';
export { MUSIC_PERFORMANCE_VISUALS } from './presets/music-performance.visual';
export { NARRATIVE_STORYTELLING_VISUALS } from './presets/narrative-storytelling.visual';
export { NETWORKING_AI_VISUALS } from './presets/networking-ai.visual';
export { NPC_ROLES_VISUALS } from './presets/npc-roles.visual';
export { OBJECT_INTERACTION_VISUALS } from './presets/object-interaction.visual';
export { PARSER_CORE_UI_VISUALS } from './presets/parser-core-ui.visual';
export { PHYSICAL_AFFORDANCES_VISUALS } from './presets/physical-affordances.visual';
export { PHYSICS_EXPANSION_VISUALS } from './presets/physics-expansion.visual';
export { PROCEDURAL_GENERATION_VISUALS } from './presets/procedural-generation.visual';
export { RESOURCE_GATHERING_VISUALS } from './presets/resource-gathering.visual';
export { SAFETY_BOUNDARIES_VISUALS } from './presets/safety-boundaries.visual';
export { SIGNS_COMMUNICATION_VISUALS } from './presets/signs-communication.visual';
export { SIMPLE_MODIFIERS_VISUALS } from './presets/simple-modifiers.visual';
export { SOCIAL_COMMERCE_VISUALS } from './presets/social-commerce.visual';
export { SOCIAL_EFFECTS_VISUALS } from './presets/social-effects.visual';
export { SPORTS_FITNESS_VISUALS } from './presets/sports-fitness.visual';
export { STATE_PERSISTENCE_VISUALS } from './presets/state-persistence.visual';
export { TRANSPORTATION_VEHICLES_VISUALS } from './presets/transportation-vehicles.visual';
export { VOLUMETRIC_WEBGPU_VISUALS } from './presets/volumetric-webgpu.visual';
export { WEATHER_PARTICLES_VISUALS } from './presets/weather-particles.visual';
export { XR_PLATFORM_VISUALS } from './presets/xr-platform.visual';
export { HOLOGRAM_MEDIA_VISUALS } from './presets/hologram-media.visual';
export { GAPS_PHYSICS_VISUALS } from './presets/gaps-physics.visual';

import { TraitVisualRegistry } from './TraitVisualRegistry';

// Original 12
import { MATERIAL_PROPERTIES_VISUALS } from './presets/material-properties.visual';
import { SURFACE_TEXTURE_VISUALS } from './presets/surface-texture.visual';
import { LIGHTING_VISUALS } from './presets/lighting.visual';
import { GEMS_MINERALS_VISUALS } from './presets/gems-minerals.visual';
import { FABRIC_CLOTH_VISUALS } from './presets/fabric-cloth.visual';
import { VISUAL_EFFECTS_VISUALS } from './presets/visual-effects.visual';
import { AGE_CONDITION_VISUALS } from './presets/age-condition.visual';
import { WATER_FLUID_VISUALS } from './presets/water-fluid.visual';
import { WEATHER_PHENOMENA_VISUALS } from './presets/weather-phenomena.visual';
import { EMOTION_MOOD_VISUALS } from './presets/emotion-mood.visual';
import { SIZE_SCALE_VISUALS } from './presets/size-scale.visual';
import { ENVIRONMENTAL_BIOME_VISUALS } from './presets/environmental-biome.visual';

// Expansion wave 1
import { MAGIC_FANTASY_VISUALS } from './presets/magic-fantasy.visual';
import { SCIFI_TECHNOLOGY_VISUALS } from './presets/scifi-technology.visual';
import { CREATURES_MYTHICAL_VISUALS } from './presets/creatures-mythical.visual';
import { NATURE_LIFE_VISUALS } from './presets/nature-life.visual';
import { FURNITURE_DECOR_VISUALS } from './presets/furniture-decor.visual';
import { CONSTRUCTION_BUILDING_VISUALS } from './presets/construction-building.visual';
import { CONTAINERS_STORAGE_VISUALS } from './presets/containers-storage.visual';
import { SHAPE_FORM_VISUALS } from './presets/shape-form.visual';
import { ANIMALS_VISUALS } from './presets/animals.visual';
import { MARITIME_NAVAL_VISUALS } from './presets/maritime-naval.visual';
import { TIME_PERIOD_VISUALS } from './presets/time-period.visual';

// Expansion wave 2 — full coverage
import { ACCESSIBILITY_VISUALS } from './presets/accessibility.visual';
import { ACCESSIBILITY_EXTENDED_VISUALS } from './presets/accessibility-extended.visual';
import { ARCHITECTURE_REALESTATE_VISUALS } from './presets/architecture-realestate.visual';
import { AUDIO_VISUALS } from './presets/audio.visual';
import { COOKING_FOOD_VISUALS } from './presets/cooking-food.visual';
import { CORE_VR_INTERACTION_VISUALS } from './presets/core-vr-interaction.visual';
import { DATA_VISUALIZATION_VISUALS } from './presets/data-visualization.visual';
import { EDUCATION_LEARNING_VISUALS } from './presets/education-learning.visual';
import { ENVIRONMENT_INPUT_VISUALS } from './presets/environment-input.visual';
import { GAME_MECHANICS_VISUALS } from './presets/game-mechanics.visual';
import { GEOSPATIAL_WEB3_VISUALS } from './presets/geospatial-web3.visual';
import { HEALTHCARE_MEDICAL_VISUALS } from './presets/healthcare-medical.visual';
import { HUMANOID_AVATAR_VISUALS } from './presets/humanoid-avatar.visual';
import { INTELLIGENCE_BEHAVIOR_VISUALS } from './presets/intelligence-behavior.visual';
import { INTEROP_COPRESENCE_VISUALS } from './presets/interop-copresence.visual';
import { IOT_AUTONOMOUS_AGENTS_VISUALS } from './presets/iot-autonomous-agents.visual';
import { LOCOMOTION_MOVEMENT_VISUALS } from './presets/locomotion-movement.visual';
import { MEASUREMENT_SENSING_VISUALS } from './presets/measurement-sensing.visual';
import { MEDIA_ANALYTICS_VISUALS } from './presets/media-analytics.visual';
import { MULTISENSORY_HAPTIC_VISUALS } from './presets/multisensory-haptic.visual';
import { MUSICAL_SOUND_VISUALS } from './presets/musical-sound.visual';
import { MUSIC_PERFORMANCE_VISUALS } from './presets/music-performance.visual';
import { NARRATIVE_STORYTELLING_VISUALS } from './presets/narrative-storytelling.visual';
import { NETWORKING_AI_VISUALS } from './presets/networking-ai.visual';
import { NPC_ROLES_VISUALS } from './presets/npc-roles.visual';
import { OBJECT_INTERACTION_VISUALS } from './presets/object-interaction.visual';
import { PARSER_CORE_UI_VISUALS } from './presets/parser-core-ui.visual';
import { PHYSICAL_AFFORDANCES_VISUALS } from './presets/physical-affordances.visual';
import { PHYSICS_EXPANSION_VISUALS } from './presets/physics-expansion.visual';
import { PROCEDURAL_GENERATION_VISUALS } from './presets/procedural-generation.visual';
import { RESOURCE_GATHERING_VISUALS } from './presets/resource-gathering.visual';
import { SAFETY_BOUNDARIES_VISUALS } from './presets/safety-boundaries.visual';
import { SIGNS_COMMUNICATION_VISUALS } from './presets/signs-communication.visual';
import { SIMPLE_MODIFIERS_VISUALS } from './presets/simple-modifiers.visual';
import { SOCIAL_COMMERCE_VISUALS } from './presets/social-commerce.visual';
import { SOCIAL_EFFECTS_VISUALS } from './presets/social-effects.visual';
import { SPORTS_FITNESS_VISUALS } from './presets/sports-fitness.visual';
import { STATE_PERSISTENCE_VISUALS } from './presets/state-persistence.visual';
import { TRANSPORTATION_VEHICLES_VISUALS } from './presets/transportation-vehicles.visual';
import { VOLUMETRIC_WEBGPU_VISUALS } from './presets/volumetric-webgpu.visual';
import { WEATHER_PARTICLES_VISUALS } from './presets/weather-particles.visual';
import { XR_PLATFORM_VISUALS } from './presets/xr-platform.visual';
import { HOLOGRAM_MEDIA_VISUALS } from './presets/hologram-media.visual';
import { GAPS_PHYSICS_VISUALS } from './presets/gaps-physics.visual';

/** All preset visual data in registration order. */
const ALL_PRESETS = [
  // Original 12
  MATERIAL_PROPERTIES_VISUALS,
  SURFACE_TEXTURE_VISUALS,
  LIGHTING_VISUALS,
  GEMS_MINERALS_VISUALS,
  FABRIC_CLOTH_VISUALS,
  VISUAL_EFFECTS_VISUALS,
  AGE_CONDITION_VISUALS,
  WATER_FLUID_VISUALS,
  WEATHER_PHENOMENA_VISUALS,
  EMOTION_MOOD_VISUALS,
  SIZE_SCALE_VISUALS,
  ENVIRONMENTAL_BIOME_VISUALS,
  // Expansion wave 1
  MAGIC_FANTASY_VISUALS,
  SCIFI_TECHNOLOGY_VISUALS,
  CREATURES_MYTHICAL_VISUALS,
  NATURE_LIFE_VISUALS,
  FURNITURE_DECOR_VISUALS,
  CONSTRUCTION_BUILDING_VISUALS,
  CONTAINERS_STORAGE_VISUALS,
  SHAPE_FORM_VISUALS,
  ANIMALS_VISUALS,
  MARITIME_NAVAL_VISUALS,
  TIME_PERIOD_VISUALS,
  // Expansion wave 2 — full coverage
  ACCESSIBILITY_VISUALS,
  ACCESSIBILITY_EXTENDED_VISUALS,
  ARCHITECTURE_REALESTATE_VISUALS,
  AUDIO_VISUALS,
  COOKING_FOOD_VISUALS,
  CORE_VR_INTERACTION_VISUALS,
  DATA_VISUALIZATION_VISUALS,
  EDUCATION_LEARNING_VISUALS,
  ENVIRONMENT_INPUT_VISUALS,
  GAME_MECHANICS_VISUALS,
  GEOSPATIAL_WEB3_VISUALS,
  HEALTHCARE_MEDICAL_VISUALS,
  HUMANOID_AVATAR_VISUALS,
  INTELLIGENCE_BEHAVIOR_VISUALS,
  INTEROP_COPRESENCE_VISUALS,
  IOT_AUTONOMOUS_AGENTS_VISUALS,
  LOCOMOTION_MOVEMENT_VISUALS,
  MEASUREMENT_SENSING_VISUALS,
  MEDIA_ANALYTICS_VISUALS,
  MULTISENSORY_HAPTIC_VISUALS,
  MUSICAL_SOUND_VISUALS,
  MUSIC_PERFORMANCE_VISUALS,
  NARRATIVE_STORYTELLING_VISUALS,
  NETWORKING_AI_VISUALS,
  NPC_ROLES_VISUALS,
  OBJECT_INTERACTION_VISUALS,
  PARSER_CORE_UI_VISUALS,
  PHYSICAL_AFFORDANCES_VISUALS,
  PHYSICS_EXPANSION_VISUALS,
  PROCEDURAL_GENERATION_VISUALS,
  RESOURCE_GATHERING_VISUALS,
  SAFETY_BOUNDARIES_VISUALS,
  SIGNS_COMMUNICATION_VISUALS,
  SIMPLE_MODIFIERS_VISUALS,
  SOCIAL_COMMERCE_VISUALS,
  SOCIAL_EFFECTS_VISUALS,
  SPORTS_FITNESS_VISUALS,
  STATE_PERSISTENCE_VISUALS,
  TRANSPORTATION_VEHICLES_VISUALS,
  VOLUMETRIC_WEBGPU_VISUALS,
  WEATHER_PARTICLES_VISUALS,
  XR_PLATFORM_VISUALS,
  // Hologram Media Pipeline
  HOLOGRAM_MEDIA_VISUALS,
  // GAPS Feature Roadmap — Phase 1
  GAPS_PHYSICS_VISUALS,
];

/**
 * Register all preset visuals into the global registry.
 * Called once on module load. Exported for testing (re-registration after reset).
 */
export function registerAllPresets(): void {
  const registry = TraitVisualRegistry.getInstance();
  for (const presetMap of ALL_PRESETS) {
    registry.registerBatch(presetMap);
  }
}

// Auto-register on import
registerAllPresets();
