import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for core-vr-interaction traits (13 traits).
 * Core VR interaction primitives.
 */
export const CORE_VR_INTERACTION_VISUALS: Record<string, TraitVisualConfig> = {
  grabbable: {
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['interactive', 'hand'],
    layer: 'physical',
  },
  throwable: {
    tags: ['dynamic', 'hand'],
    layer: 'physical',
  },
  pointable: {
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['interactive', 'cursor'],
    layer: 'physical',
  },
  hoverable: {
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['interactive', 'highlight'],
    layer: 'physical',
  },
  scalable: {
    tags: ['resizable', 'interactive'],
    layer: 'physical',
  },
  rotatable: {
    tags: ['spinnable', 'interactive'],
    layer: 'physical',
  },
  stackable: {
    tags: ['stable', 'flat-top'],
    layer: 'physical',
  },
  snappable: {
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['magnetic', 'alignment'],
    layer: 'physical',
  },
  breakable: {
    tags: ['fragile', 'destructible'],
    layer: 'physical',
  },
  stretchable: {
    tags: ['elastic', 'deformable'],
    layer: 'physical',
  },
  moldable: {
    tags: ['soft', 'deformable'],
    layer: 'physical',
  },
  timeline: {
    material: { roughness: 0.3 },
    emissive: { color: '#88AAFF', intensity: 0.15 },
    tags: ['temporal', 'animated'],
    layer: 'visual_effect',
  },
  choreography: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF88CC', intensity: 0.15 },
    tags: ['animated', 'sequenced'],
    layer: 'visual_effect',
  },
};
