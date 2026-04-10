import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for media & analytics traits (8 traits).
 * Media capture, broadcasting, and data analytics visualization.
 */
export const MEDIA_ANALYTICS_VISUALS: Record<string, TraitVisualConfig> = {
  recordable: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF0000', intensity: 0.2 },
    tags: ['recording', 'active'],
    layer: 'visual_effect',
  },
  streamable: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF4488', intensity: 0.15 },
    tags: ['broadcast', 'active'],
    layer: 'visual_effect',
  },
  camera: {
    material: { roughness: 0.3, metalness: 0.5, color: '#2C2C2C' },
    tags: ['equipment', 'electronic'],
    layer: 'base_material',
  },
  video: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF0000', intensity: 0.15 },
    tags: ['media', 'recording'],
    layer: 'visual_effect',
  },
  trackable: {
    material: { roughness: 0.4 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['data', 'system'],
    layer: 'visual_effect',
  },
  survey: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CC44', intensity: 0.1 },
    tags: ['data', 'interactive'],
    layer: 'visual_effect',
  },
  abtest: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF8844', intensity: 0.1 },
    tags: ['data', 'experimental'],
    layer: 'visual_effect',
  },
  heatmap: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF4400', intensity: 0.25 },
    tags: ['data', 'visualization'],
    layer: 'visual_effect',
  },
};
