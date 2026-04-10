import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for cooking & food traits (39 traits).
 * Kitchen equipment, cookware, utensils, and food items.
 */
export const COOKING_FOOD_VISUALS: Record<string, TraitVisualConfig> = {
  ingredient: { material: { roughness: 0.7 }, tags: ['organic', 'food'], layer: 'base_material' },
  recipe: {
    material: { roughness: 0.7, color: '#D4C5A0' },
    tags: ['paper', 'readable'],
    layer: 'base_material',
  },
  chopping_board: {
    material: { roughness: 0.6, color: '#C4A882' },
    tags: ['wooden', 'surface'],
    layer: 'base_material',
  },
  knife: {
    material: { roughness: 0.15, metalness: 0.9, color: '#C0C0C0' },
    tags: ['metallic', 'sharp'],
    layer: 'base_material',
  },
  pan: {
    material: { roughness: 0.3, metalness: 0.7, color: '#333333' },
    tags: ['metallic', 'cookware'],
    layer: 'base_material',
  },
  pot: {
    material: { roughness: 0.3, metalness: 0.8, color: '#C0C0C0' },
    tags: ['metallic', 'cookware'],
    layer: 'base_material',
  },
  oven: {
    material: { roughness: 0.3, metalness: 0.5, color: '#333333' },
    emissive: { color: '#FF4400', intensity: 0.15 },
    tags: ['appliance', 'metallic', 'hot'],
    layer: 'base_material',
  },
  stove: {
    material: { roughness: 0.3, metalness: 0.6, color: '#333333' },
    emissive: { color: '#FF2200', intensity: 0.2 },
    tags: ['appliance', 'metallic', 'hot'],
    layer: 'base_material',
  },
  grill: {
    material: { roughness: 0.5, metalness: 0.7, color: '#2C2C2C' },
    emissive: { color: '#FF4400', intensity: 0.15 },
    tags: ['metallic', 'hot'],
    layer: 'base_material',
  },
  smoker: {
    material: { roughness: 0.6, metalness: 0.5, color: '#333333' },
    particleEffect: 'smoke',
    tags: ['metallic', 'hot'],
    layer: 'base_material',
  },
  deep_fryer: {
    material: { roughness: 0.3, metalness: 0.6, color: '#C0C0C0' },
    tags: ['appliance', 'metallic', 'hot'],
    layer: 'base_material',
  },
  blender: {
    material: { roughness: 0.2, metalness: 0.4, color: '#E8E8E8' },
    tags: ['appliance', 'electronic'],
    layer: 'base_material',
  },
  mixer_kitchen: {
    material: { roughness: 0.3, metalness: 0.5, color: '#CC3333' },
    tags: ['appliance', 'metallic'],
    layer: 'base_material',
  },
  whisk: {
    material: { roughness: 0.2, metalness: 0.9, color: '#C0C0C0' },
    tags: ['tool', 'metallic'],
    layer: 'base_material',
  },
  spatula: {
    material: { roughness: 0.5, color: '#444444' },
    tags: ['tool'],
    layer: 'base_material',
  },
  ladle: {
    material: { roughness: 0.3, metalness: 0.8, color: '#C0C0C0' },
    tags: ['tool', 'metallic'],
    layer: 'base_material',
  },
  tongs: {
    material: { roughness: 0.3, metalness: 0.8, color: '#C0C0C0' },
    tags: ['tool', 'metallic'],
    layer: 'base_material',
  },
  rolling_pin: {
    material: { roughness: 0.5, color: '#C4A882' },
    tags: ['tool', 'wooden'],
    layer: 'base_material',
  },
  measuring_cup: {
    material: { roughness: 0.2, transmission: 0.6, ior: 1.5 },
    tags: ['glass', 'transparent'],
    layer: 'base_material',
  },
  timer_kitchen: {
    material: { roughness: 0.4, color: '#E8E8E8' },
    emissive: { color: '#FF0000', intensity: 0.2 },
    tags: ['electronic', 'display'],
    layer: 'visual_effect',
  },
  thermometer_food: {
    material: { roughness: 0.3, metalness: 0.5, color: '#C0C0C0' },
    emissive: { color: '#FF4400', intensity: 0.1 },
    tags: ['tool', 'electronic'],
    layer: 'base_material',
  },
  plate: {
    material: { roughness: 0.2, color: '#F5F5F5' },
    tags: ['ceramic', 'clean'],
    layer: 'base_material',
  },
  bowl: {
    material: { roughness: 0.2, color: '#F5F5F5' },
    tags: ['ceramic', 'clean'],
    layer: 'base_material',
  },
  cup: {
    material: { roughness: 0.2, color: '#F5F5F5' },
    tags: ['ceramic'],
    layer: 'base_material',
  },
  glass_container: {
    material: { roughness: 0.1, transmission: 0.8, ior: 1.5 },
    tags: ['glass', 'transparent'],
    layer: 'base_material',
  },
  bottle: {
    material: { roughness: 0.1, transmission: 0.7, ior: 1.5 },
    tags: ['glass', 'transparent'],
    layer: 'base_material',
  },
  jar: {
    material: { roughness: 0.15, transmission: 0.6, ior: 1.5 },
    tags: ['glass', 'transparent'],
    layer: 'base_material',
  },
  edible: { material: { roughness: 0.7 }, tags: ['food', 'consumable'], layer: 'condition' },
  drinkable: { material: { roughness: 0.3 }, tags: ['liquid', 'consumable'], layer: 'condition' },
  bakeable: { material: { roughness: 0.6 }, tags: ['food', 'cookable'], layer: 'condition' },
  grillable: { material: { roughness: 0.6 }, tags: ['food', 'cookable'], layer: 'condition' },
  fermentable: { material: { roughness: 0.7 }, tags: ['organic', 'process'], layer: 'condition' },
  garnish: {
    material: { roughness: 0.6, color: '#2E8B57' },
    tags: ['food', 'organic'],
    layer: 'base_material',
  },
  seasoning: {
    material: { roughness: 0.8, color: '#8B6914' },
    tags: ['food', 'powder'],
    layer: 'base_material',
  },
  marinade: {
    material: { roughness: 0.4, color: '#6B3A1F' },
    tags: ['liquid', 'food'],
    layer: 'base_material',
  },
  sauce: {
    material: { roughness: 0.4, color: '#CC2200' },
    tags: ['liquid', 'food'],
    layer: 'base_material',
  },
  dough: {
    material: { roughness: 0.8, color: '#F5DEB3' },
    tags: ['organic', 'soft'],
    layer: 'base_material',
  },
  batter: {
    material: { roughness: 0.5, color: '#F5DEB3' },
    tags: ['liquid', 'food'],
    layer: 'base_material',
  },
  frosting: {
    material: { roughness: 0.3, color: '#FFEFD5' },
    tags: ['sweet', 'smooth'],
    layer: 'surface',
  },
};
