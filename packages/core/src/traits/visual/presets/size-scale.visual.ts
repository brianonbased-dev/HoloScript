import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for size & scale traits (18 traits).
 * Scale multipliers for objects.
 */
export const SIZE_SCALE_VISUALS: Record<string, TraitVisualConfig> = {
  tiny: {
    scale: [0.1, 0.1, 0.1],
    tags: ['small'],
    layer: 'scale',
  },
  small: {
    scale: [0.5, 0.5, 0.5],
    tags: ['small'],
    layer: 'scale',
  },
  medium: {
    scale: [1, 1, 1],
    tags: ['normal'],
    layer: 'scale',
  },
  large: {
    scale: [2, 2, 2],
    tags: ['big'],
    layer: 'scale',
  },
  huge: {
    scale: [4, 4, 4],
    tags: ['big'],
    layer: 'scale',
  },
  giant: {
    scale: [8, 8, 8],
    tags: ['big'],
    layer: 'scale',
  },
  colossal: {
    scale: [16, 16, 16],
    tags: ['massive'],
    layer: 'scale',
  },
  miniature: {
    scale: [0.2, 0.2, 0.2],
    tags: ['small'],
    layer: 'scale',
  },
  towering: {
    scale: [1, 6, 1],
    tags: ['tall'],
    layer: 'scale',
  },
  microscale: {
    scale: [0.01, 0.01, 0.01],
    tags: ['tiny'],
    layer: 'scale',
  },
  human_scale: {
    scale: [1, 1.8, 1],
    tags: ['normal'],
    layer: 'scale',
  },
  building_scale: {
    scale: [10, 10, 10],
    tags: ['massive'],
    layer: 'scale',
  },
  city_scale: {
    scale: [100, 100, 100],
    tags: ['massive'],
    layer: 'scale',
  },
  planetary_scale: {
    scale: [1000, 1000, 1000],
    tags: ['cosmic'],
    layer: 'scale',
  },
  pocket_sized: {
    scale: [0.15, 0.15, 0.15],
    tags: ['small'],
    layer: 'scale',
  },
  oversized: {
    scale: [3, 3, 3],
    tags: ['big'],
    layer: 'scale',
  },
  shrinkable: {
    scale: [1, 1, 1],
    tags: ['animated', 'scalable'],
    layer: 'scale',
  },
  expandable: {
    scale: [1, 1, 1],
    tags: ['animated', 'scalable'],
    layer: 'scale',
  },
};
