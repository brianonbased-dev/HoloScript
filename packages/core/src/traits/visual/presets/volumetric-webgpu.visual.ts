import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for volumetric-webgpu traits (9 traits).
 * Volumetric rendering and GPU-accelerated features.
 */
export const VOLUMETRIC_WEBGPU_VISUALS: Record<string, TraitVisualConfig> = {
  gaussian_splat: {
    material: { roughness: 0.2 },
    emissive: { color: '#AACCFF', intensity: 0.15 },
    tags: ['3d', 'photorealistic'],
    layer: 'visual_effect',
  },
  nerf: {
    material: { roughness: 0.2 },
    emissive: { color: '#88AAFF', intensity: 0.15 },
    tags: ['3d', 'photorealistic'],
    layer: 'visual_effect',
  },
  volumetric_video: {
    material: { roughness: 0.3 },
    tags: ['3d', 'video', 'holographic'],
    layer: 'visual_effect',
  },
  point_cloud: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['3d', 'data'],
    layer: 'visual_effect',
  },
  photogrammetry: {
    material: { roughness: 0.5 },
    tags: ['3d', 'photorealistic', 'scanned'],
    layer: 'visual_effect',
  },
  compute: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['gpu', 'processing'],
    layer: 'visual_effect',
  },
  gpu_particle: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF8844', intensity: 0.2 },
    particleEffect: 'gpu_particles',
    tags: ['gpu', 'particle'],
    layer: 'visual_effect',
  },
  gpu_physics: {
    material: { roughness: 0.4 },
    emissive: { color: '#44AAFF', intensity: 0.15 },
    tags: ['gpu', 'physics'],
    layer: 'visual_effect',
  },
  gpu_buffer: {
    material: { roughness: 0.3 },
    tags: ['gpu', 'data'],
    layer: 'visual_effect',
  },
};
