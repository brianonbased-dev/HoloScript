import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for musical/sound traits (10 traits).
 * Musical and sound traits.
 */
export const MUSICAL_SOUND_VISUALS: Record<string, TraitVisualConfig> = {
  musical: {
    material: { roughness: 0.4 },
    emissive: { color: '#CC88FF', intensity: 0.15 },
    tags: ['audio', 'creative'],
    layer: 'visual_effect',
  },
  ambient_sound: {
    material: { roughness: 0.5 },
    opacity: 0.4,
    emissive: { color: '#88AACC', intensity: 0.1 },
    tags: ['audio', 'atmosphere'],
    layer: 'environmental',
  },
  voice_activated: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CC88', intensity: 0.15 },
    tags: ['audio', 'interactive'],
    layer: 'visual_effect',
  },
  sound_emitter: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFAA44', intensity: 0.2 },
    tags: ['audio', 'source'],
    layer: 'visual_effect',
  },
  sound_absorber: {
    material: { roughness: 0.9, color: '#333333' },
    tags: ['audio', 'dampening'],
    layer: 'surface',
  },
  rhythm: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF4488', intensity: 0.15 },
    tags: ['audio', 'pulsing'],
    layer: 'visual_effect',
  },
  melody: {
    material: { roughness: 0.3 },
    emissive: { color: '#88CCFF', intensity: 0.15 },
    tags: ['audio', 'harmonic'],
    layer: 'visual_effect',
  },
  harmony: {
    material: { roughness: 0.3 },
    emissive: { color: '#88FFCC', intensity: 0.15 },
    tags: ['audio', 'blend'],
    layer: 'visual_effect',
  },
  percussion: {
    material: { roughness: 0.5, metalness: 0.4 },
    tags: ['audio', 'rhythmic', 'metallic'],
    layer: 'visual_effect',
  },
  synthesizer: {
    material: { roughness: 0.3, color: '#1A1A2E' },
    emissive: { color: '#FF44FF', intensity: 0.2 },
    tags: ['electronic', 'audio'],
    layer: 'visual_effect',
  },
};
