import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for object interaction traits (25 traits).
 * Interactive object states and actions.
 */
export const OBJECT_INTERACTION_VISUALS: Record<string, TraitVisualConfig> = {
  openable: {
    material: { roughness: 0.5 },
    tags: ['interactive', 'hinged'],
    layer: 'physical',
  },
  closable: {
    material: { roughness: 0.5 },
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
    material: { roughness: 0.6 },
    tags: ['heavy', 'movable'],
    layer: 'physical',
  },
  pullable: {
    material: { roughness: 0.6 },
    tags: ['heavy', 'movable'],
    layer: 'physical',
  },
  liftable: {
    material: { roughness: 0.5 },
    tags: ['movable', 'light'],
    layer: 'physical',
  },
  carryable: {
    material: { roughness: 0.5 },
    tags: ['portable', 'movable'],
    layer: 'physical',
  },
  wearable: {
    material: { roughness: 0.5 },
    tags: ['clothing', 'equippable'],
    layer: 'physical',
  },
  equippable: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['interactive', 'slot'],
    layer: 'physical',
  },
  consumable: {
    material: { roughness: 0.5 },
    emissive: { color: '#44CC88', intensity: 0.1 },
    tags: ['usable', 'depleting'],
    layer: 'physical',
  },
  craftable: {
    material: { roughness: 0.5 },
    emissive: { color: '#FFAA44', intensity: 0.1 },
    tags: ['interactive', 'creative'],
    layer: 'physical',
  },
  combinable: {
    material: { roughness: 0.5 },
    tags: ['interactive', 'merge'],
    layer: 'physical',
  },
  splittable: {
    material: { roughness: 0.5 },
    tags: ['interactive', 'divide'],
    layer: 'physical',
  },
  foldable: {
    material: { roughness: 0.6 },
    tags: ['flexible', 'transformable'],
    layer: 'physical',
  },
  fillable: {
    material: { roughness: 0.4 },
    tags: ['container', 'interactive'],
    layer: 'physical',
  },
  pourable: {
    material: { roughness: 0.3 },
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
    material: { roughness: 0.5 },
    tags: ['creative', 'surface'],
    layer: 'physical',
  },
  cuttable: {
    material: { roughness: 0.5 },
    tags: ['destructive', 'interactive'],
    layer: 'physical',
  },
  toggleable: {
    material: { roughness: 0.4 },
    tags: ['switch', 'interactive'],
    layer: 'physical',
  },
  tunable: {
    material: { roughness: 0.4 },
    tags: ['adjustable', 'interactive'],
    layer: 'physical',
  },
  insertable: {
    material: { roughness: 0.4 },
    tags: ['slot', 'connectable'],
    layer: 'physical',
  },
  removable: {
    material: { roughness: 0.4 },
    tags: ['detachable', 'interactive'],
    layer: 'physical',
  },
};
