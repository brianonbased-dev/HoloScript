import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for locomotion and movement traits (14 traits).
 * Movement affordances for objects and surfaces.
 */
export const LOCOMOTION_MOVEMENT_VISUALS: Record<string, TraitVisualConfig> = {
  rideable: {
    material: { roughness: 0.5, color: '#8B6914' },
    tags: ['mountable', 'animal'],
    layer: 'physical',
  },
  driveable: {
    material: { roughness: 0.3, metalness: 0.5, color: '#333333' },
    tags: ['vehicle', 'mechanical'],
    layer: 'physical',
  },
  mountable: {
    material: { roughness: 0.6 },
    tags: ['rideable', 'interactive'],
    layer: 'physical',
  },
  climbable: {
    material: { roughness: 0.8 },
    tags: ['grip', 'vertical'],
    layer: 'physical',
  },
  swimmable: {
    material: { roughness: 0.2, color: '#4488CC', transmission: 0.5, ior: 1.33 },
    tags: ['water', 'fluid'],
    layer: 'physical',
  },
  flyable: {
    material: { roughness: 0.3 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['aerial', 'dynamic'],
    layer: 'physical',
  },
  teleportable: {
    material: { roughness: 0.3 },
    emissive: { color: '#AA44FF', intensity: 0.25 },
    tags: ['magic', 'instant'],
    layer: 'visual_effect',
  },
  walkable: {
    material: { roughness: 0.6 },
    tags: ['surface', 'stable'],
    layer: 'physical',
  },
  jumpable: {
    material: { roughness: 0.5 },
    tags: ['dynamic', 'bouncy'],
    layer: 'physical',
  },
  sittable: {
    material: { roughness: 0.5 },
    tags: ['furniture', 'rest'],
    layer: 'physical',
  },
  crawlable: {
    material: { roughness: 0.7 },
    tags: ['low', 'tight'],
    layer: 'physical',
  },
  slidable: {
    material: { roughness: 0.1 },
    tags: ['smooth', 'fast'],
    layer: 'physical',
  },
  grindable: {
    material: { roughness: 0.3, metalness: 0.5 },
    tags: ['rail', 'fast'],
    layer: 'physical',
  },
  surfable: {
    material: { roughness: 0.2, color: '#4488CC' },
    tags: ['water', 'dynamic'],
    layer: 'physical',
  },
};
