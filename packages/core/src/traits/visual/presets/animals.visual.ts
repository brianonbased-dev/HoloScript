import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for animal traits (48 traits).
 * Color palettes and surface properties for animal types.
 */
export const ANIMALS_VISUALS: Record<string, TraitVisualConfig> = {
  cat: {
    material: { roughness: 0.85, color: '#A0785A' },
    tags: ['furry', 'small'],
    layer: 'base_material',
  },
  dog: {
    material: { roughness: 0.9, color: '#B8860B' },
    tags: ['furry', 'medium'],
    layer: 'base_material',
  },
  wolf: {
    material: { roughness: 0.9, color: '#696969' },
    tags: ['furry', 'predator'],
    layer: 'base_material',
  },
  bear: {
    material: { roughness: 0.95, color: '#5C3A21' },
    tags: ['furry', 'large'],
    layer: 'base_material',
  },
  horse: {
    material: { roughness: 0.6, color: '#8B4513' },
    tags: ['smooth', 'large'],
    layer: 'base_material',
  },
  deer: {
    material: { roughness: 0.7, color: '#C4956A' },
    tags: ['smooth', 'graceful'],
    layer: 'base_material',
  },
  rabbit: {
    material: { roughness: 0.95, color: '#D4C4A8' },
    tags: ['furry', 'small'],
    layer: 'base_material',
  },
  fox: {
    material: { roughness: 0.85, color: '#D4652F' },
    tags: ['furry', 'small'],
    layer: 'base_material',
  },
  eagle: {
    material: { roughness: 0.7, color: '#5C4033' },
    tags: ['feathered', 'aerial'],
    layer: 'base_material',
  },
  hawk: {
    material: { roughness: 0.7, color: '#8B6914' },
    tags: ['feathered', 'aerial'],
    layer: 'base_material',
  },
  owl: {
    material: { roughness: 0.9, color: '#8B7355' },
    tags: ['feathered', 'nocturnal'],
    layer: 'base_material',
  },
  crow: {
    material: { roughness: 0.6, color: '#1A1A1A' },
    tags: ['feathered', 'dark'],
    layer: 'base_material',
  },
  parrot: {
    material: { roughness: 0.5, color: '#00CC00' },
    tags: ['feathered', 'colorful'],
    layer: 'base_material',
  },
  penguin: {
    material: { roughness: 0.5, color: '#1A1A1A' },
    tags: ['feathered', 'aquatic'],
    layer: 'base_material',
  },
  shark: {
    material: { roughness: 0.3, color: '#4A5A6A' },
    tags: ['aquatic', 'predator'],
    layer: 'base_material',
  },
  whale: {
    material: { roughness: 0.4, color: '#2F4F4F' },
    tags: ['aquatic', 'massive'],
    layer: 'base_material',
  },
  dolphin: {
    material: { roughness: 0.2, color: '#708090' },
    tags: ['aquatic', 'smooth'],
    layer: 'base_material',
  },
  octopus: {
    material: { roughness: 0.3, color: '#8B3A62' },
    tags: ['aquatic', 'tentacled'],
    layer: 'base_material',
  },
  jellyfish: {
    material: { roughness: 0.0, color: '#DDA0DD', transparent: true, opacity: 0.5 },
    emissive: { color: '#DDA0DD', intensity: 0.3 },
    tags: ['aquatic', 'translucent'],
    layer: 'base_material',
  },
  crab: {
    material: { roughness: 0.5, color: '#CD5C5C' },
    tags: ['aquatic', 'shelled'],
    layer: 'base_material',
  },
  turtle: {
    material: { roughness: 0.6, color: '#556B2F' },
    tags: ['shelled', 'slow'],
    layer: 'base_material',
  },
  snake: {
    material: { roughness: 0.3, color: '#4A5A3A', envMapIntensity: 0.6 },
    tags: ['scaled', 'reptilian'],
    layer: 'base_material',
  },
  lizard: {
    material: { roughness: 0.4, color: '#6B8E23' },
    tags: ['scaled', 'reptilian'],
    layer: 'base_material',
  },
  frog: {
    material: { roughness: 0.3, color: '#32CD32', envMapIntensity: 0.8 },
    tags: ['smooth', 'wet'],
    layer: 'base_material',
  },
  butterfly: {
    material: { roughness: 0.4, iridescence: 0.7 },
    tags: ['delicate', 'colorful'],
    layer: 'base_material',
  },
  bee: {
    material: { roughness: 0.7, color: '#FFD700' },
    tags: ['furry', 'striped', 'tiny'],
    layer: 'base_material',
  },
  spider: {
    material: { roughness: 0.5, color: '#1A1A1A' },
    tags: ['dark', 'small'],
    layer: 'base_material',
  },
  ant: {
    material: { roughness: 0.4, color: '#2C1A0E' },
    tags: ['tiny', 'shiny'],
    layer: 'base_material',
  },
  bat_animal: {
    material: { roughness: 0.8, color: '#2C2C2C' },
    tags: ['dark', 'winged'],
    layer: 'base_material',
  },
  rat: {
    material: { roughness: 0.85, color: '#808080' },
    tags: ['furry', 'small'],
    layer: 'base_material',
  },
  mouse: {
    material: { roughness: 0.9, color: '#C0C0C0' },
    tags: ['furry', 'tiny'],
    layer: 'base_material',
  },
  pig: {
    material: { roughness: 0.5, color: '#FFB6C1' },
    tags: ['smooth', 'medium'],
    layer: 'base_material',
  },
  cow: { material: { roughness: 0.7, color: '#F5F5DC' }, tags: ['large'], layer: 'base_material' },
  sheep: {
    material: { roughness: 1.0, color: '#F5F5F5' },
    tags: ['woolly', 'soft'],
    layer: 'base_material',
  },
  goat: {
    material: { roughness: 0.8, color: '#A0785A' },
    tags: ['furry', 'medium'],
    layer: 'base_material',
  },
  chicken: {
    material: { roughness: 0.8, color: '#F4A460' },
    tags: ['feathered', 'small'],
    layer: 'base_material',
  },
  duck: {
    material: { roughness: 0.5, color: '#556B2F' },
    tags: ['feathered', 'aquatic'],
    layer: 'base_material',
  },
  fish: {
    material: { roughness: 0.2, color: '#4682B4', envMapIntensity: 0.8 },
    tags: ['aquatic', 'scaled'],
    layer: 'base_material',
  },
  elephant: {
    material: { roughness: 0.8, color: '#808080' },
    scale: [3, 3, 3],
    tags: ['large', 'wrinkled'],
    layer: 'base_material',
  },
  lion: {
    material: { roughness: 0.7, color: '#DAA520' },
    tags: ['furry', 'predator'],
    layer: 'base_material',
  },
  tiger: {
    material: { roughness: 0.6, color: '#FF8C00' },
    tags: ['furry', 'predator', 'striped'],
    layer: 'base_material',
  },
  monkey: {
    material: { roughness: 0.7, color: '#8B6914' },
    tags: ['furry', 'medium'],
    layer: 'base_material',
  },
  gorilla: {
    material: { roughness: 0.9, color: '#2C2C2C' },
    scale: [1.5, 1.5, 1.5],
    tags: ['furry', 'large'],
    layer: 'base_material',
  },
  dinosaur: {
    material: { roughness: 0.5, color: '#556B2F' },
    scale: [4, 4, 4],
    tags: ['scaled', 'massive'],
    layer: 'base_material',
  },
  insect: {
    material: { roughness: 0.3, color: '#2C2C2C', envMapIntensity: 0.5 },
    tags: ['shiny', 'tiny'],
    layer: 'base_material',
  },
  bird: {
    material: { roughness: 0.6, color: '#4169E1' },
    tags: ['feathered', 'aerial'],
    layer: 'base_material',
  },
  reptile: {
    material: { roughness: 0.35, color: '#4A5A3A', envMapIntensity: 0.6 },
    tags: ['scaled', 'reptilian'],
    layer: 'base_material',
  },
  mammal: {
    material: { roughness: 0.7, color: '#C4956A' },
    tags: ['furry'],
    layer: 'base_material',
  },
};
