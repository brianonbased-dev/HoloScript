import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for accessibility-extended traits (27 traits).
 * Extended accessibility options.
 */
export const ACCESSIBILITY_EXTENDED_VISUALS: Record<string, TraitVisualConfig> = {
  cognitive_assist: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['helpful', 'guided'],
    layer: 'visual_effect',
  },
  sensory_substitution: {
    material: { roughness: 0.4 },
    tags: ['adaptive', 'cross-modal'],
    layer: 'visual_effect',
  },
  one_handed: {
    material: { roughness: 0.4 },
    tags: ['input', 'adaptive'],
    layer: 'visual_effect',
  },
  seated_mode: {
    material: { roughness: 0.4 },
    tags: ['comfort', 'position'],
    layer: 'visual_effect',
  },
  standing_mode: {
    material: { roughness: 0.4 },
    tags: ['position', 'active'],
    layer: 'visual_effect',
  },
  voice_only: {
    material: { roughness: 0.4 },
    tags: ['input', 'audio'],
    layer: 'visual_effect',
  },
  gaze_only: {
    material: { roughness: 0.4 },
    tags: ['input', 'eye-tracking'],
    layer: 'visual_effect',
  },
  switch_access: {
    material: { roughness: 0.4 },
    tags: ['input', 'adaptive'],
    layer: 'visual_effect',
  },
  large_text: {
    material: { roughness: 0.3 },
    tags: ['text', 'visibility'],
    layer: 'visual_effect',
  },
  dyslexia_friendly: {
    material: { roughness: 0.4 },
    tags: ['text', 'readable'],
    layer: 'visual_effect',
  },
  color_blind_safe: {
    material: { roughness: 0.4 },
    tags: ['color', 'visibility'],
    layer: 'visual_effect',
  },
  photosensitive_safe: {
    material: { roughness: 0.5 },
    tags: ['comfort', 'safety'],
    layer: 'visual_effect',
  },
  reduced_complexity: {
    material: { roughness: 0.5 },
    tags: ['simplified', 'comfort'],
    layer: 'visual_effect',
  },
  guided_mode: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CCFF', intensity: 0.15 },
    tags: ['helpful', 'educational'],
    layer: 'visual_effect',
  },
  auto_narrate: {
    material: { roughness: 0.4 },
    tags: ['audio', 'descriptive'],
    layer: 'visual_effect',
  },
  sign_language: {
    material: { roughness: 0.5 },
    tags: ['visual', 'communication'],
    layer: 'visual_effect',
  },
  braille_output: {
    material: { roughness: 0.8 },
    tags: ['tactile', 'haptic'],
    layer: 'surface',
  },
  audio_description: {
    material: { roughness: 0.4 },
    tags: ['audio', 'descriptive'],
    layer: 'visual_effect',
  },
  closed_caption: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#FFFFFF', intensity: 0.15 },
    tags: ['text', 'audio'],
    layer: 'visual_effect',
  },
  adjustable_speed: {
    material: { roughness: 0.4 },
    tags: ['control', 'temporal'],
    layer: 'visual_effect',
  },
  adjustable_difficulty: {
    material: { roughness: 0.4 },
    tags: ['control', 'adaptive'],
    layer: 'visual_effect',
  },
  comfort_mode: {
    material: { roughness: 0.5 },
    tags: ['comfort', 'safety'],
    layer: 'visual_effect',
  },
  teleport_only: {
    material: { roughness: 0.3 },
    emissive: { color: '#AA44FF', intensity: 0.15 },
    tags: ['movement', 'comfort'],
    layer: 'visual_effect',
  },
  snap_turning: {
    material: { roughness: 0.4 },
    tags: ['movement', 'comfort'],
    layer: 'visual_effect',
  },
  continuous_turning: {
    material: { roughness: 0.4 },
    tags: ['movement', 'smooth'],
    layer: 'visual_effect',
  },
  vignette: {
    material: { roughness: 0.3, color: '#000000' },
    opacity: 0.6,
    tags: ['comfort', 'visual'],
    layer: 'visual_effect',
  },
  stable_horizon: {
    material: { roughness: 0.4 },
    tags: ['comfort', 'stability'],
    layer: 'visual_effect',
  },
};
