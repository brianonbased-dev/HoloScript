import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for furniture & decor traits (36 traits).
 */
export const FURNITURE_DECOR_VISUALS: Record<string, TraitVisualConfig> = {
  chair: {
    material: { roughness: 0.7, color: '#8B6914' },
    tags: ['wooden', 'seating'],
    layer: 'base_material',
  },
  table: {
    material: { roughness: 0.6, color: '#6B4423' },
    tags: ['wooden', 'flat'],
    layer: 'base_material',
  },
  desk: {
    material: { roughness: 0.5, color: '#5C3A21' },
    tags: ['wooden', 'flat'],
    layer: 'base_material',
  },
  bench: {
    material: { roughness: 0.8, color: '#8B7355' },
    tags: ['wooden', 'seating'],
    layer: 'base_material',
  },
  stool: {
    material: { roughness: 0.7, color: '#A0785A' },
    tags: ['wooden', 'seating'],
    layer: 'base_material',
  },
  sofa: {
    material: { roughness: 0.85, color: '#5A3A2A' },
    tags: ['fabric', 'soft'],
    layer: 'base_material',
  },
  bed_furniture: {
    material: { roughness: 0.9, color: '#F5F5F5' },
    tags: ['fabric', 'soft'],
    layer: 'base_material',
  },
  bookshelf: {
    material: { roughness: 0.7, color: '#6B4423' },
    tags: ['wooden', 'storage'],
    layer: 'base_material',
  },
  wardrobe: {
    material: { roughness: 0.6, color: '#5C3A21' },
    tags: ['wooden', 'storage'],
    layer: 'base_material',
  },
  dresser: {
    material: { roughness: 0.5, color: '#8B6914' },
    tags: ['wooden', 'storage'],
    layer: 'base_material',
  },
  nightstand: {
    material: { roughness: 0.6, color: '#6B4423' },
    tags: ['wooden', 'small'],
    layer: 'base_material',
  },
  coffee_table: {
    material: { roughness: 0.4, color: '#5C3A21' },
    tags: ['wooden', 'flat'],
    layer: 'base_material',
  },
  dining_table: {
    material: { roughness: 0.5, color: '#6B4423' },
    tags: ['wooden', 'flat'],
    layer: 'base_material',
  },
  counter: {
    material: { roughness: 0.3, color: '#808080', metalness: 0.1 },
    tags: ['stone', 'flat'],
    layer: 'base_material',
  },
  throne: {
    material: { roughness: 0.4, color: '#8B0000', metalness: 0.3, envMapIntensity: 1.0 },
    tags: ['ornate', 'noble'],
    layer: 'base_material',
  },
  pedestal: {
    material: { roughness: 0.2, color: '#F0EDE6' },
    tags: ['stone', 'display'],
    layer: 'base_material',
  },
  mannequin: {
    material: { roughness: 0.5, color: '#E8D8B8' },
    tags: ['humanoid'],
    layer: 'base_material',
  },
  statue: {
    material: { roughness: 0.3, color: '#C0C0C0', metalness: 0.1 },
    tags: ['stone', 'decorative'],
    layer: 'base_material',
  },
  bust: {
    material: { roughness: 0.3, color: '#D4C4A8' },
    tags: ['stone', 'portrait'],
    layer: 'base_material',
  },
  vase_decor: {
    material: { roughness: 0.2, color: '#FAEBD7' },
    tags: ['ceramic', 'decorative'],
    layer: 'base_material',
  },
  painting: {
    material: { roughness: 0.8, color: '#8B6914' },
    tags: ['wooden', 'wall'],
    layer: 'base_material',
  },
  sculpture: {
    material: { roughness: 0.3, metalness: 0.2, color: '#808080' },
    tags: ['artistic', 'decorative'],
    layer: 'base_material',
  },
  mirror_decor: {
    material: { roughness: 0.0, metalness: 1.0, envMapIntensity: 2.5 },
    tags: ['reflective', 'glass'],
    layer: 'base_material',
  },
  clock: {
    material: { roughness: 0.4, metalness: 0.5, color: '#B87333' },
    tags: ['metallic', 'mechanical'],
    layer: 'base_material',
  },
  candelabra: {
    material: { roughness: 0.3, metalness: 0.8, color: '#FFD700' },
    emissive: { color: '#FF9933', intensity: 0.4 },
    tags: ['metallic', 'ornate'],
    layer: 'base_material',
  },
  trophy: {
    material: { roughness: 0.1, metalness: 1.0, color: '#FFD700', envMapIntensity: 1.5 },
    tags: ['metallic', 'golden'],
    layer: 'base_material',
  },
  globe: {
    material: { roughness: 0.5, color: '#4682B4' },
    tags: ['spherical', 'decorative'],
    layer: 'base_material',
  },
  aquarium_decor: {
    material: { roughness: 0.0, transmission: 0.9, ior: 1.5, transparent: true, color: '#4488CC' },
    tags: ['glass', 'water'],
    layer: 'base_material',
  },
  terrarium_decor: {
    material: { roughness: 0.0, transmission: 0.85, ior: 1.5, transparent: true },
    tags: ['glass', 'nature'],
    layer: 'base_material',
  },
  plant_pot: {
    material: { roughness: 0.85, color: '#CC6644' },
    tags: ['ceramic', 'garden'],
    layer: 'base_material',
  },
  fountain: {
    material: { roughness: 0.3, color: '#A0A0A0' },
    particleEffect: 'water_flow',
    tags: ['stone', 'water'],
    layer: 'base_material',
  },
  birdcage: {
    material: { roughness: 0.3, metalness: 0.7, color: '#C0C0C0' },
    tags: ['metallic', 'open'],
    layer: 'base_material',
  },
  picture_frame: {
    material: { roughness: 0.4, metalness: 0.3, color: '#8B6914' },
    tags: ['wooden', 'wall'],
    layer: 'base_material',
  },
  rug_decor: {
    material: { roughness: 1.0, color: '#993333' },
    tags: ['fabric', 'floor'],
    layer: 'base_material',
  },
  chandelier_decor: {
    material: { roughness: 0.1, metalness: 0.7, color: '#FFD700' },
    emissive: { color: '#FFD700', intensity: 1.0 },
    tags: ['metallic', 'ornate', 'emissive'],
    layer: 'base_material',
  },
  fireplace: {
    material: { roughness: 0.9, color: '#8B4513' },
    emissive: { color: '#FF6600', intensity: 0.8 },
    particleEffect: 'fire',
    tags: ['stone', 'warm'],
    layer: 'base_material',
  },
};
