import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for object interaction traits (25 traits).
 * Interactive object states and actions.
 */
export const OBJECT_INTERACTION_VISUALS: Record<string, TraitVisualConfig> = {
  openable: {
    tags: ['interactive', 'hinged'],
    layer: 'physical',
  },
  closable: {
    tags: ['interactive', 'hinged'],
    layer: 'physical',
  },
  lockable: {
    material: { roughness: 0.4, metalness: 0.5 },
    tags: ['metallic', 'security'],
    layer: 'physical',
  },
  unlockable: {
    material: { roughness: 0.4, metalness: 0.5 },
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['metallic', 'security'],
    layer: 'physical',
  },
  pushable: {
    tags: ['heavy', 'movable'],
    layer: 'physical',
  },
  pullable: {
    tags: ['heavy', 'movable'],
    layer: 'physical',
  },
  liftable: {
    tags: ['movable', 'light'],
    layer: 'physical',
  },
  carryable: {
    tags: ['portable', 'movable'],
    layer: 'physical',
  },
  wearable: {
    tags: ['clothing', 'equippable'],
    layer: 'physical',
  },
  equippable: {
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['interactive', 'slot'],
    layer: 'physical',
  },
  consumable: {
    emissive: { color: '#44CC88', intensity: 0.1 },
    tags: ['usable', 'depleting'],
    layer: 'physical',
  },
  craftable: {
    emissive: { color: '#FFAA44', intensity: 0.1 },
    tags: ['interactive', 'creative'],
    layer: 'physical',
  },
  combinable: {
    tags: ['interactive', 'merge'],
    layer: 'physical',
  },
  splittable: {
    tags: ['interactive', 'divide'],
    layer: 'physical',
  },
  foldable: {
    tags: ['flexible', 'transformable'],
    layer: 'physical',
  },
  fillable: {
    tags: ['container', 'interactive'],
    layer: 'physical',
  },
  pourable: {
    tags: ['liquid', 'interactive'],
    layer: 'physical',
  },
  readable: {
    material: { roughness: 0.5, color: '#FFFFF0' },
    tags: ['text', 'informational'],
    layer: 'physical',
  },
  writable: {
    material: { roughness: 0.4, color: '#FFFFF0' },
    tags: ['text', 'interactive'],
    layer: 'physical',
  },
  paintable: {
    tags: ['creative', 'surface'],
    layer: 'physical',
  },
  cuttable: {
    tags: ['destructive', 'interactive'],
    layer: 'physical',
  },
  toggleable: {
    tags: ['switch', 'interactive'],
    layer: 'physical',
  },
  tunable: {
    tags: ['adjustable', 'interactive'],
    layer: 'physical',
  },
  insertable: {
    tags: ['slot', 'connectable'],
    layer: 'physical',
  },
  removable: {
    tags: ['detachable', 'interactive'],
    layer: 'physical',
  },
};
