import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for core-vr-interaction traits (13 traits).
 * Core VR interaction primitives.
 */
export const CORE_VR_INTERACTION_VISUALS: Record<string, TraitVisualConfig> = {
  grabbable: {
    material: { roughness: 0.5 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['interactive', 'hand'],
    layer: 'physical',
  },
  throwable: {
    material: { roughness: 0.5 },
    tags: ['dynamic', 'hand'],
    layer: 'physical',
  },
  pointable: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['interactive', 'cursor'],
    layer: 'physical',
  },
  hoverable: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['interactive', 'highlight'],
    layer: 'physical',
  },
  scalable: {
    material: { roughness: 0.4 },
    tags: ['resizable', 'interactive'],
    layer: 'physical',
  },
  rotatable: {
    material: { roughness: 0.4 },
    tags: ['spinnable', 'interactive'],
    layer: 'physical',
  },
  stackable: {
    material: { roughness: 0.5 },
    tags: ['stable', 'flat-top'],
    layer: 'physical',
  },
  snappable: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['magnetic', 'alignment'],
    layer: 'physical',
  },
  breakable: {
    material: { roughness: 0.5 },
    tags: ['fragile', 'destructible'],
    layer: 'physical',
  },
  stretchable: {
    material: { roughness: 0.6 },
    tags: ['elastic', 'deformable'],
    layer: 'physical',
  },
  moldable: {
    material: { roughness: 0.7 },
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
