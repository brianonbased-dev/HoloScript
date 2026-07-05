import type { TraitVisualConfig } from '../types';

export const SIMULATION_DOMAIN_VISUALS: Record<string, TraitVisualConfig> = {
  reduced_order_model: {
    material: { roughness: 0.25, metalness: 0.15, color: '#4f8cff' },
    tags: ['simulation', 'surrogate', 'digital-twin', 'edge-ready'],
    layer: 'visual_effect',
  },
};
