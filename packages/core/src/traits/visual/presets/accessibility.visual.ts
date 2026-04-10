import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for accessibility traits (10 traits).
 * Core accessibility features.
 */
export const ACCESSIBILITY_VISUALS: Record<string, TraitVisualConfig> = {
  accessible: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['inclusive', 'system'],
    layer: 'visual_effect',
  },
  alt_text: {
    material: { roughness: 0.4 },
    tags: ['text', 'descriptive'],
    layer: 'visual_effect',
  },
  spatial_audio_cue: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.15 },
    tags: ['audio', 'navigation'],
    layer: 'visual_effect',
  },
  sonification: {
    material: { roughness: 0.4 },
    emissive: { color: '#AA88FF', intensity: 0.1 },
    tags: ['audio', 'data'],
    layer: 'visual_effect',
  },
  haptic_cue: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFAA44', intensity: 0.1 },
    tags: ['haptic', 'feedback'],
    layer: 'visual_effect',
  },
  magnifiable: {
    material: { roughness: 0.3 },
    tags: ['zoomable', 'interactive'],
    layer: 'visual_effect',
  },
  high_contrast: {
    material: { roughness: 0.3, color: '#FFFFFF' },
    tags: ['visibility', 'contrast'],
    layer: 'visual_effect',
  },
  motion_reduced: {
    material: { roughness: 0.5 },
    tags: ['comfort', 'static'],
    layer: 'visual_effect',
  },
  subtitle: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#FFFFFF', intensity: 0.2 },
    tags: ['text', 'readable'],
    layer: 'visual_effect',
  },
  screen_reader: {
    material: { roughness: 0.4 },
    tags: ['audio', 'text'],
    layer: 'visual_effect',
  },
};
