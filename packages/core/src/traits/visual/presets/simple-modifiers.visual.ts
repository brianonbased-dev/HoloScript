import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for simple modifier traits (8 traits).
 * Basic visual modifiers and simple affordances.
 */
export const SIMPLE_MODIFIERS_VISUALS: Record<string, TraitVisualConfig> = {
  animated: {
    material: { roughness: 0.4 },
    tags: ['dynamic', 'moving'],
    layer: 'visual_effect',
  },
  billboard: {
    material: { roughness: 0.3 },
    tags: ['flat', 'camera-facing'],
    layer: 'visual_effect',
  },
  rotating: {
    material: { roughness: 0.4 },
    tags: ['dynamic', 'spinning'],
    layer: 'visual_effect',
  },
  collidable: {
    material: { roughness: 0.5 },
    tags: ['solid', 'physics'],
    layer: 'physical',
  },
  clickable: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['interactive', 'ui'],
    layer: 'physical',
  },
  glowing: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFDD44', intensity: 0.4 },
    tags: ['emissive', 'bright'],
    layer: 'lighting',
  },
  interactive: {
    material: { roughness: 0.4 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['responsive', 'ui'],
    layer: 'physical',
  },
  lod: {
    material: { roughness: 0.5 },
    tags: ['optimization', 'multi-resolution'],
    layer: 'visual_effect',
  },
};
