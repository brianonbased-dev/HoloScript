import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for humanoid/avatar traits (11 traits).
 * Avatar and body traits for humanoid characters.
 */
export const HUMANOID_AVATAR_VISUALS: Record<string, TraitVisualConfig> = {
  skeleton: {
    material: { roughness: 0.6, metalness: 0.0, color: '#E8DCC8' },
    tags: ['bone', 'anatomical'],
    layer: 'base_material',
  },
  body: {
    material: { roughness: 0.7, color: '#D2A679' },
    tags: ['organic', 'skin'],
    layer: 'base_material',
  },
  face: {
    material: { roughness: 0.6, color: '#D2A679' },
    tags: ['organic', 'expressive'],
    layer: 'base_material',
  },
  expressive: {
    material: { roughness: 0.5 },
    emissive: { color: '#FFCC88', intensity: 0.1 },
    tags: ['animated', 'social'],
    layer: 'mood',
  },
  hair: {
    material: { roughness: 0.8, color: '#3B2F2F' },
    tags: ['organic', 'fiber'],
    layer: 'surface',
  },
  clothing: {
    material: { roughness: 0.6 },
    tags: ['fabric', 'wearable'],
    layer: 'surface',
  },
  hands: {
    material: { roughness: 0.6, color: '#D2A679' },
    tags: ['organic', 'interactive'],
    layer: 'base_material',
  },
  character_voice: {
    material: { roughness: 0.5 },
    tags: ['audio', 'social'],
    layer: 'mood',
  },
  locomotion: {
    material: { roughness: 0.5 },
    tags: ['movement', 'animated'],
    layer: 'physical',
  },
  poseable: {
    material: { roughness: 0.5 },
    tags: ['animated', 'interactive'],
    layer: 'physical',
  },
  morph: {
    material: { roughness: 0.5 },
    tags: ['animated', 'dynamic'],
    layer: 'visual_effect',
  },
};
