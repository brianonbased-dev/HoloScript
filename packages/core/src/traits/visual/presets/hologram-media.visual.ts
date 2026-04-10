import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for hologram media pipeline traits.
 * 2D-to-3D hologram generation with depth estimation, displacement,
 * segmentation, animated textures, and quilt output.
 */
export const HOLOGRAM_MEDIA_VISUALS: Record<string, TraitVisualConfig> = {
  depth_estimation: {
    material: { roughness: 0.3 },
    emissive: { color: '#6644FF', intensity: 0.2 },
    tags: ['ai', 'depth', 'hologram'],
    layer: 'visual_effect',
  },
  displacement: {
    material: { roughness: 0.4 },
    emissive: { color: '#8866FF', intensity: 0.15 },
    tags: ['3d', 'depth', 'mesh'],
    layer: 'visual_effect',
  },
  segment: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF44AA', intensity: 0.15 },
    tags: ['ai', 'segmentation', 'mask'],
    layer: 'visual_effect',
  },
  animated_texture: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FFAA', intensity: 0.15 },
    tags: ['animation', 'texture', 'gif'],
    layer: 'visual_effect',
  },
  holographic_sprite: {
    material: { roughness: 0.2 },
    emissive: { color: '#AA44FF', intensity: 0.3 },
    tags: ['hologram', 'sprite', '3d'],
    layer: 'visual_effect',
  },
  quilt: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.2 },
    tags: ['hologram', 'multiview', 'looking-glass'],
    layer: 'visual_effect',
  },
  gaussian_splatting: {
    material: { roughness: 0.2 },
    emissive: { color: '#AACCFF', intensity: 0.15 },
    tags: ['3d', 'photorealistic', 'splat'],
    layer: 'visual_effect',
  },
  spatial_video: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF8844', intensity: 0.15 },
    tags: ['video', 'stereo', 'spatial'],
    layer: 'visual_effect',
  },
  image: {
    material: { roughness: 0.4 },
    tags: ['media', 'texture', 'source'],
    layer: 'base_material',
  },
  depth_sequence: {
    material: { roughness: 0.3 },
    emissive: { color: '#6644FF', intensity: 0.1 },
    tags: ['video', 'depth', 'temporal'],
    layer: 'visual_effect',
  },
  temporal_smoothing: {
    material: { roughness: 0.3 },
    tags: ['processing', 'temporal'],
    layer: 'visual_effect',
  },
  depth_to_normal: {
    material: { roughness: 0.3 },
    emissive: { color: '#8888FF', intensity: 0.1 },
    tags: ['processing', 'normal-map'],
    layer: 'visual_effect',
  },
};
