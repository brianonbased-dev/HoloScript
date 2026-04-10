import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for social/sharing effect traits (8 traits).
 * Social interaction and sharing visual effects.
 */
export const SOCIAL_EFFECTS_VISUALS: Record<string, TraitVisualConfig> = {
  shareable: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.15 },
    tags: ['social', 'interactive'],
    layer: 'visual_effect',
  },
  embeddable: {
    material: { roughness: 0.4 },
    tags: ['technical'],
    layer: 'visual_effect',
  },
  qr: {
    material: { roughness: 0.2, color: '#111111' },
    tags: ['pattern', 'data'],
    layer: 'visual_effect',
  },
  collaborative: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CC88', intensity: 0.2 },
    tags: ['social', 'interactive'],
    layer: 'visual_effect',
  },
  particle: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFAA44', intensity: 0.3 },
    particleEffect: 'generic',
    tags: ['effect', 'animated'],
    layer: 'visual_effect',
  },
  transition: {
    material: { roughness: 0.3 },
    opacity: 0.8,
    tags: ['animated', 'temporal'],
    layer: 'visual_effect',
  },
  filter: {
    material: { roughness: 0.3 },
    tags: ['overlay', 'visual'],
    layer: 'visual_effect',
  },
  trail: {
    material: { roughness: 0.3 },
    emissive: { color: '#88CCFF', intensity: 0.2 },
    particleEffect: 'trail',
    tags: ['effect', 'movement'],
    layer: 'visual_effect',
  },
};
