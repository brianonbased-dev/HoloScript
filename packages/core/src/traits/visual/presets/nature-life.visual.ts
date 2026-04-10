import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for nature & life traits (19 traits).
 */
export const NATURE_LIFE_VISUALS: Record<string, TraitVisualConfig> = {
  growable: {
    material: { color: '#228B22', roughness: 0.8 },
    tags: ['organic', 'living'],
    layer: 'base_material',
  },
  witherable: {
    material: { color: '#8B7355', roughness: 0.9 },
    tags: ['organic', 'dying'],
    layer: 'condition',
  },
  bloomable: {
    material: { color: '#FF69B4', roughness: 0.6 },
    emissive: { color: '#FF69B4', intensity: 0.2 },
    tags: ['organic', 'flowering'],
    layer: 'base_material',
  },
  pollinating: {
    particleEffect: 'pollen',
    material: { color: '#FFD700' },
    tags: ['organic', 'particle'],
    layer: 'visual_effect',
  },
  photosynthetic: {
    material: { color: '#32CD32', roughness: 0.7 },
    emissive: { color: '#00FF00', intensity: 0.1 },
    tags: ['organic', 'green'],
    layer: 'base_material',
  },
  bioluminescent: {
    emissive: { color: '#00FFAA', intensity: 1.0 },
    material: { emissive: '#00FFAA', emissiveIntensity: 1.0 },
    tags: ['organic', 'glowing'],
    layer: 'visual_effect',
  },
  venomous: {
    emissive: { color: '#00FF00', intensity: 0.4 },
    material: { color: '#3A5A1A' },
    tags: ['danger', 'organic'],
    layer: 'visual_effect',
  },
  symbiotic: {
    material: { color: '#6B8E23', roughness: 0.7 },
    tags: ['organic'],
    layer: 'base_material',
  },
  parasitic: {
    material: { color: '#5A1A2A', roughness: 0.8 },
    tags: ['organic', 'dark'],
    layer: 'base_material',
  },
  carnivorous_plant: {
    material: { color: '#8B2252', roughness: 0.5 },
    emissive: { color: '#FF0066', intensity: 0.2 },
    tags: ['organic', 'predatory'],
    layer: 'base_material',
  },
  aquatic: {
    material: { color: '#20B2AA', roughness: 0.3, envMapIntensity: 0.8 },
    tags: ['water', 'organic'],
    layer: 'base_material',
  },
  amphibious: {
    material: { color: '#3CB371', roughness: 0.4 },
    tags: ['water', 'organic'],
    layer: 'base_material',
  },
  aerial: {
    material: { transparent: true, opacity: 0.8, color: '#87CEEB' },
    tags: ['air', 'lightweight'],
    layer: 'base_material',
  },
  burrowing: {
    material: { roughness: 0.95, color: '#6B4423' },
    tags: ['earth', 'underground'],
    layer: 'base_material',
  },
  nesting: {
    material: { roughness: 0.9, color: '#C8A96E' },
    tags: ['organic', 'woven'],
    layer: 'base_material',
  },
  egg: {
    material: { roughness: 0.3, color: '#FFF8DC' },
    tags: ['organic', 'smooth'],
    layer: 'base_material',
  },
  larva: {
    material: { roughness: 0.5, color: '#E8D8B8', transparent: true, opacity: 0.9 },
    tags: ['organic', 'translucent'],
    layer: 'base_material',
  },
  cocoon: {
    material: { roughness: 0.7, color: '#C4B99A' },
    tags: ['organic', 'wrapped'],
    layer: 'base_material',
  },
  metamorphic: {
    emissive: { color: '#CC88FF', intensity: 0.4 },
    material: { iridescence: 0.5 },
    tags: ['magical', 'transforming'],
    layer: 'visual_effect',
  },
};
