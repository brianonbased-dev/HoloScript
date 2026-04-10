import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for xr-platform traits (25 traits).
 * XR platform capabilities and modes.
 */
export const XR_PLATFORM_VISUALS: Record<string, TraitVisualConfig> = {
  passthrough: {
    material: { roughness: 0.2 },
    opacity: 0.5,
    tags: ['ar', 'transparent'],
    layer: 'visual_effect',
  },
  room_scale: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['vr', 'scale'],
    layer: 'visual_effect',
  },
  world_scale: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['vr', 'scale'],
    layer: 'visual_effect',
  },
  tabletop_scale: {
    material: { roughness: 0.4 },
    scale: [0.3, 0.3, 0.3],
    tags: ['miniature', 'scale'],
    layer: 'scale',
  },
  shared_space: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CCAA', intensity: 0.15 },
    tags: ['social', 'collaborative'],
    layer: 'visual_effect',
  },
  persistent_world: {
    material: { roughness: 0.5 },
    tags: ['persistent', 'world'],
    layer: 'environmental',
  },
  cross_platform: {
    material: { roughness: 0.4 },
    tags: ['universal', 'compatible'],
    layer: 'visual_effect',
  },
  webxr: {
    material: { roughness: 0.4 },
    tags: ['web', 'platform'],
    layer: 'visual_effect',
  },
  openxr: {
    material: { roughness: 0.4 },
    tags: ['standard', 'platform'],
    layer: 'visual_effect',
  },
  arkit: {
    material: { roughness: 0.4 },
    tags: ['apple', 'ar'],
    layer: 'visual_effect',
  },
  arcore: {
    material: { roughness: 0.4 },
    tags: ['google', 'ar'],
    layer: 'visual_effect',
  },
  visionos: {
    material: { roughness: 0.3, metalness: 0.2 },
    tags: ['apple', 'xr'],
    layer: 'visual_effect',
  },
  quest_native: {
    material: { roughness: 0.4 },
    tags: ['meta', 'vr'],
    layer: 'visual_effect',
  },
  pcvr: {
    material: { roughness: 0.4 },
    tags: ['desktop', 'vr'],
    layer: 'visual_effect',
  },
  mobile_ar: {
    material: { roughness: 0.4 },
    tags: ['mobile', 'ar'],
    layer: 'visual_effect',
  },
  headset_only: {
    material: { roughness: 0.3, color: '#1A1A2E' },
    tags: ['vr', 'exclusive'],
    layer: 'visual_effect',
  },
  controller_required: {
    material: { roughness: 0.3, metalness: 0.3 },
    tags: ['input', 'required'],
    layer: 'visual_effect',
  },
  hands_only: {
    material: { roughness: 0.5 },
    tags: ['input', 'natural'],
    layer: 'visual_effect',
  },
  seated_experience: {
    material: { roughness: 0.5 },
    tags: ['comfort', 'relaxed'],
    layer: 'visual_effect',
  },
  standing_experience: {
    material: { roughness: 0.5 },
    tags: ['active', 'physical'],
    layer: 'visual_effect',
  },
  room_boundary: {
    material: { roughness: 0.3 },
    opacity: 0.4,
    emissive: { color: '#FF8844', intensity: 0.2 },
    tags: ['safety', 'boundary'],
    layer: 'environmental',
  },
  guardian_system: {
    material: { roughness: 0.3 },
    opacity: 0.3,
    emissive: { color: '#44AAFF', intensity: 0.25 },
    tags: ['safety', 'boundary'],
    layer: 'environmental',
  },
  mixed_reality: {
    material: { roughness: 0.3 },
    opacity: 0.6,
    tags: ['mr', 'blended'],
    layer: 'visual_effect',
  },
  diminished_reality: {
    material: { roughness: 0.3 },
    opacity: 0.4,
    tags: ['ar', 'removal'],
    layer: 'visual_effect',
  },
  augmented_virtuality: {
    material: { roughness: 0.3 },
    opacity: 0.7,
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['av', 'hybrid'],
    layer: 'visual_effect',
  },
};
