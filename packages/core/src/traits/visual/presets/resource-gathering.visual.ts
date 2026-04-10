import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for resource gathering traits (8 traits).
 * Resource states and gathering actions.
 */
export const RESOURCE_GATHERING_VISUALS: Record<string, TraitVisualConfig> = {
  plantable: {
    material: { roughness: 0.7, color: '#6B4423' },
    tags: ['organic', 'soil'],
    layer: 'condition',
  },
  harvestable: {
    material: { roughness: 0.6, color: '#FFD700' },
    emissive: { color: '#88CC44', intensity: 0.15 },
    tags: ['organic', 'ready'],
    layer: 'condition',
  },
  mineable: {
    material: { roughness: 0.8, metalness: 0.3, color: '#666666' },
    tags: ['mineral', 'hard'],
    layer: 'condition',
  },
  fishable: {
    material: { roughness: 0.3, color: '#4488CC' },
    tags: ['water', 'natural'],
    layer: 'condition',
  },
  cookable: {
    material: { roughness: 0.6 },
    tags: ['food', 'processable'],
    layer: 'condition',
  },
  forgeable: {
    material: { roughness: 0.5, metalness: 0.6 },
    emissive: { color: '#FF4400', intensity: 0.15 },
    tags: ['metallic', 'hot'],
    layer: 'condition',
  },
  distillable: {
    material: { roughness: 0.3, transmission: 0.5, ior: 1.4 },
    tags: ['liquid', 'transparent'],
    layer: 'condition',
  },
  recyclable: {
    material: { roughness: 0.5, color: '#44AA44' },
    tags: ['sustainable', 'reusable'],
    layer: 'condition',
  },
};
