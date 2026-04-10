import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for container & storage traits (30 traits).
 */
export const CONTAINERS_STORAGE_VISUALS: Record<string, TraitVisualConfig> = {
  container: {
    material: { roughness: 0.6, color: '#808080' },
    tags: ['storage'],
    layer: 'base_material',
  },
  drawer: {
    material: { roughness: 0.6, color: '#6B4423' },
    tags: ['wooden', 'storage'],
    layer: 'base_material',
  },
  shelf: {
    material: { roughness: 0.7, color: '#8B6914' },
    tags: ['wooden', 'flat'],
    layer: 'base_material',
  },
  cabinet: {
    material: { roughness: 0.5, color: '#5C3A21' },
    tags: ['wooden', 'storage'],
    layer: 'base_material',
  },
  chest_container: {
    material: { roughness: 0.6, color: '#8B4513', metalness: 0.2 },
    tags: ['wooden', 'reinforced'],
    layer: 'base_material',
  },
  crate: {
    material: { roughness: 0.9, color: '#C4A35A' },
    tags: ['wooden', 'rough'],
    layer: 'base_material',
  },
  barrel_container: {
    material: { roughness: 0.8, color: '#8B6914' },
    tags: ['wooden', 'round'],
    layer: 'base_material',
  },
  basket: {
    material: { roughness: 0.9, color: '#C8A96E' },
    tags: ['woven', 'organic'],
    layer: 'base_material',
  },
  backpack: {
    material: { roughness: 0.8, color: '#556B2F' },
    tags: ['fabric', 'wearable'],
    layer: 'base_material',
  },
  vault: {
    material: { roughness: 0.2, metalness: 1.0, color: '#4A4A4A', envMapIntensity: 1.0 },
    tags: ['metallic', 'secure'],
    layer: 'base_material',
  },
  locker: {
    material: { roughness: 0.3, metalness: 0.8, color: '#808080' },
    tags: ['metallic', 'storage'],
    layer: 'base_material',
  },
  safe: {
    material: { roughness: 0.2, metalness: 1.0, color: '#3C3C3C' },
    tags: ['metallic', 'secure'],
    layer: 'base_material',
  },
  bin: {
    material: { roughness: 0.5, color: '#4A4A4A' },
    tags: ['plastic', 'utility'],
    layer: 'base_material',
  },
  hopper: {
    material: { roughness: 0.4, metalness: 0.7, color: '#888888' },
    tags: ['metallic', 'industrial'],
    layer: 'base_material',
  },
  silo: {
    material: { roughness: 0.4, metalness: 0.6, color: '#A0A0A0' },
    tags: ['metallic', 'large'],
    layer: 'base_material',
  },
  tank: {
    material: { roughness: 0.3, metalness: 0.8, color: '#808080' },
    tags: ['metallic', 'cylindrical'],
    layer: 'base_material',
  },
  aquarium: {
    material: { roughness: 0.0, transmission: 0.9, ior: 1.5, transparent: true, color: '#4488CC' },
    tags: ['glass', 'water'],
    layer: 'base_material',
  },
  terrarium: {
    material: { roughness: 0.0, transmission: 0.85, ior: 1.5, transparent: true },
    tags: ['glass', 'nature'],
    layer: 'base_material',
  },
  display_case: {
    material: { roughness: 0.0, transmission: 0.95, ior: 1.5, transparent: true },
    tags: ['glass', 'transparent'],
    layer: 'base_material',
  },
  trophy_case: {
    material: { roughness: 0.0, transmission: 0.9, ior: 1.5, transparent: true, color: '#F5F5DC' },
    tags: ['glass', 'ornate'],
    layer: 'base_material',
  },
  mailbox: {
    material: { roughness: 0.5, metalness: 0.5, color: '#0000AA' },
    tags: ['metallic'],
    layer: 'base_material',
  },
  inventory: { tags: ['abstract', 'ui'], layer: 'visual_effect' },
  slot: { tags: ['abstract', 'ui'], layer: 'visual_effect' },
  pocket: { tags: ['abstract', 'hidden'], layer: 'visual_effect' },
  compartment: { tags: ['abstract', 'hidden'], layer: 'physical' },
  cargo: {
    material: { roughness: 0.7, color: '#4A5A3A' },
    tags: ['large', 'utility'],
    layer: 'base_material',
  },
  quiver: {
    material: { roughness: 0.7, color: '#8B6914' },
    tags: ['leather', 'wearable'],
    layer: 'base_material',
  },
  holster: {
    material: { roughness: 0.6, color: '#5C3A21' },
    tags: ['leather', 'wearable'],
    layer: 'base_material',
  },
  sheath: {
    material: { roughness: 0.5, color: '#6B4423' },
    tags: ['leather', 'wearable'],
    layer: 'base_material',
  },
  pouch: {
    material: { roughness: 0.8, color: '#C4956A' },
    tags: ['leather', 'small'],
    layer: 'base_material',
  },
};
