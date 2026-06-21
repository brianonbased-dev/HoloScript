import type { TraitVisualConfig } from '../types';

/**
 * Visual config for @perceptual_color.
 * The runtime/compiler payload supplies the actual palette; this preset gives
 * scenes a visible analytical material before renderer-specific color ramps land.
 */
export const PERCEPTUAL_COLOR_VISUALS: Record<string, TraitVisualConfig> = {
  perceptual_color: {
    material: {
      roughness: 0.28,
      metalness: 0.0,
      color: '#21918C',
    },
    emissive: { color: '#FDE725', intensity: 0.18 },
    tags: ['data', 'scientific', 'color'],
    layer: 'visual_effect',
  },
};
