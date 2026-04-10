import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for audio traits (10 traits).
 * Audio system traits with visual indicators.
 */
export const AUDIO_VISUALS: Record<string, TraitVisualConfig> = {
  spatial_audio: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.15 },
    tags: ['audio', '3d'],
    layer: 'visual_effect',
  },
  voice: {
    material: { roughness: 0.4 },
    emissive: { color: '#66BBFF', intensity: 0.1 },
    tags: ['audio', 'speech'],
    layer: 'visual_effect',
  },
  reactive_audio: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF88CC', intensity: 0.15 },
    tags: ['audio', 'responsive'],
    layer: 'visual_effect',
  },
  ambisonics: {
    material: { roughness: 0.4 },
    emissive: { color: '#AA88FF', intensity: 0.1 },
    tags: ['audio', 'immersive'],
    layer: 'visual_effect',
  },
  hrtf: {
    material: { roughness: 0.4 },
    tags: ['audio', '3d', 'spatial'],
    layer: 'visual_effect',
  },
  reverb_zone: {
    material: { roughness: 0.5 },
    opacity: 0.3,
    emissive: { color: '#888888', intensity: 0.1 },
    tags: ['audio', 'zone', 'ambient'],
    layer: 'environmental',
  },
  audio_occlusion: {
    material: { roughness: 0.6 },
    tags: ['audio', 'physics'],
    layer: 'visual_effect',
  },
  audio_portal: {
    material: { roughness: 0.3 },
    opacity: 0.5,
    emissive: { color: '#88AAFF', intensity: 0.15 },
    tags: ['audio', 'passage'],
    layer: 'visual_effect',
  },
  audio_material: {
    material: { roughness: 0.5 },
    tags: ['audio', 'surface'],
    layer: 'surface',
  },
  head_tracked_audio: {
    material: { roughness: 0.4 },
    tags: ['audio', 'tracking'],
    layer: 'visual_effect',
  },
};
