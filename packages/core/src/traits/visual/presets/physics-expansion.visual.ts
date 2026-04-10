import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for physics expansion traits (8 traits).
 * Advanced physics simulation traits.
 */
export const PHYSICS_EXPANSION_VISUALS: Record<string, TraitVisualConfig> = {
  cloth: {
    material: { roughness: 0.7 },
    tags: ['fabric', 'flexible', 'simulated'],
    layer: 'visual_effect',
  },
  fluid: {
    material: { roughness: 0.1, color: '#4488CC', transmission: 0.5, ior: 1.33 },
    tags: ['liquid', 'dynamic', 'simulated'],
    layer: 'visual_effect',
  },
  soft_body: {
    material: { roughness: 0.6 },
    tags: ['deformable', 'elastic', 'simulated'],
    layer: 'visual_effect',
  },
  rope: {
    material: { roughness: 0.7, color: '#8B6914' },
    tags: ['flexible', 'fiber'],
    layer: 'base_material',
  },
  chain: {
    material: { roughness: 0.3, metalness: 0.9, color: '#888888' },
    tags: ['metallic', 'linked'],
    layer: 'base_material',
  },
  wind: {
    material: { roughness: 0.3 },
    particleEffect: 'wind',
    tags: ['atmospheric', 'force'],
    layer: 'environmental',
  },
  buoyancy: {
    material: { roughness: 0.3, color: '#88CCDD' },
    tags: ['water', 'floating'],
    layer: 'physical',
  },
  destruction: {
    material: { roughness: 0.7 },
    emissive: { color: '#FF4400', intensity: 0.2 },
    particleEffect: 'debris',
    tags: ['breakable', 'dynamic'],
    layer: 'visual_effect',
  },
};
