import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for environment-input traits (15 traits).
 * Environment detection and input tracking.
 */
export const ENVIRONMENT_INPUT_VISUALS: Record<string, TraitVisualConfig> = {
  plane_detection: {
    material: { roughness: 0.3 },
    opacity: 0.4,
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['ar', 'scanning'],
    layer: 'visual_effect',
  },
  mesh_detection: {
    material: { roughness: 0.3 },
    opacity: 0.4,
    emissive: { color: '#4488FF', intensity: 0.15 },
    tags: ['ar', 'scanning'],
    layer: 'visual_effect',
  },
  anchor: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFCC00', intensity: 0.2 },
    tags: ['ar', 'marker', 'fixed'],
    layer: 'visual_effect',
  },
  persistent_anchor: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.25 },
    tags: ['ar', 'marker', 'persistent'],
    layer: 'visual_effect',
  },
  shared_anchor: {
    material: { roughness: 0.3 },
    emissive: { color: '#44CCFF', intensity: 0.2 },
    tags: ['ar', 'marker', 'social'],
    layer: 'visual_effect',
  },
  geospatial: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CC88', intensity: 0.15 },
    tags: ['ar', 'location'],
    layer: 'visual_effect',
  },
  occlusion: {
    material: { roughness: 0.5 },
    tags: ['ar', 'depth'],
    layer: 'visual_effect',
  },
  light_estimation: {
    material: { roughness: 0.4 },
    tags: ['ar', 'lighting'],
    layer: 'lighting',
  },
  eye_tracking: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.15 },
    tags: ['input', 'gaze'],
    layer: 'visual_effect',
  },
  hand_tracking: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['input', 'hand'],
    layer: 'visual_effect',
  },
  controller: {
    material: { roughness: 0.3, metalness: 0.3, color: '#333333' },
    tags: ['input', 'device'],
    layer: 'base_material',
  },
  spatial_accessory: {
    material: { roughness: 0.3, metalness: 0.3 },
    tags: ['input', 'device'],
    layer: 'base_material',
  },
  body_tracking: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['input', 'full-body'],
    layer: 'visual_effect',
  },
  face_tracking: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFAA88', intensity: 0.1 },
    tags: ['input', 'face'],
    layer: 'visual_effect',
  },
  haptic: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFAA44', intensity: 0.1 },
    tags: ['feedback', 'tactile'],
    layer: 'visual_effect',
  },
};
