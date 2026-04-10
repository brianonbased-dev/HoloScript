import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for state/persistence traits (17 traits).
 * State management and persistence traits.
 */
export const STATE_PERSISTENCE_VISUALS: Record<string, TraitVisualConfig> = {
  saveable: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CC88', intensity: 0.1 },
    tags: ['persistent', 'data'],
    layer: 'visual_effect',
  },
  restorable: {
    material: { roughness: 0.4 },
    emissive: { color: '#88AAFF', intensity: 0.1 },
    tags: ['persistent', 'reversible'],
    layer: 'visual_effect',
  },
  timer: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF8844', intensity: 0.2 },
    tags: ['temporal', 'countdown'],
    layer: 'visual_effect',
  },
  triggered: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC00', intensity: 0.15 },
    tags: ['event', 'reactive'],
    layer: 'visual_effect',
  },
  ephemeral: {
    material: { roughness: 0.4 },
    opacity: 0.7,
    tags: ['temporary', 'fading'],
    layer: 'visual_effect',
  },
  synced: {
    material: { roughness: 0.4 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['connected', 'multiplayer'],
    layer: 'visual_effect',
  },
  versioned: {
    material: { roughness: 0.4 },
    tags: ['data', 'history'],
    layer: 'visual_effect',
  },
  undo_redo: {
    material: { roughness: 0.4 },
    tags: ['reversible', 'interactive'],
    layer: 'visual_effect',
  },
  conditional: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFAA44', intensity: 0.1 },
    tags: ['logic', 'dynamic'],
    layer: 'visual_effect',
  },
  staged: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CC44', intensity: 0.1 },
    tags: ['sequential', 'progress'],
    layer: 'visual_effect',
  },
  phased: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['sequential', 'temporal'],
    layer: 'visual_effect',
  },
  dormant: {
    material: { roughness: 0.6 },
    opacity: 0.6,
    tags: ['inactive', 'sleeping'],
    layer: 'condition',
  },
  active: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.2 },
    tags: ['active', 'energized'],
    layer: 'condition',
  },
  cooldown: {
    material: { roughness: 0.5 },
    emissive: { color: '#4488FF', intensity: 0.15 },
    opacity: 0.8,
    tags: ['temporal', 'recharging'],
    layer: 'visual_effect',
  },
  charged: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFDD00', intensity: 0.3 },
    tags: ['energy', 'ready'],
    layer: 'visual_effect',
  },
  depleted: {
    material: { roughness: 0.7 },
    opacity: 0.7,
    tags: ['empty', 'exhausted'],
    layer: 'condition',
  },
  overloaded: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF4400', intensity: 0.35 },
    tags: ['overcharged', 'danger'],
    layer: 'visual_effect',
  },
};
