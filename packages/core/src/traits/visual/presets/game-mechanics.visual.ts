import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for game mechanics traits (36 traits).
 * Game objects, collectibles, and interactive game elements.
 */
export const GAME_MECHANICS_VISUALS: Record<string, TraitVisualConfig> = {
  collectible: {
    material: { roughness: 0.2, metalness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.25 },
    tags: ['reward', 'glowing'],
    layer: 'visual_effect',
  },
  spawnable: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['system', 'dynamic'],
    layer: 'visual_effect',
  },
  destructible: {
    material: { roughness: 0.5 },
    tags: ['breakable', 'interactive'],
    layer: 'physical',
  },
  healable: {
    material: { roughness: 0.4 },
    emissive: { color: '#00FF88', intensity: 0.2 },
    tags: ['healing', 'positive'],
    layer: 'visual_effect',
  },
  damageable: {
    material: { roughness: 0.5 },
    tags: ['combat', 'interactive'],
    layer: 'physical',
  },
  explosive: {
    material: { roughness: 0.5, color: '#8B0000' },
    emissive: { color: '#FF4400', intensity: 0.3 },
    tags: ['danger', 'fire'],
    layer: 'visual_effect',
  },
  flammable: {
    material: { roughness: 0.6 },
    emissive: { color: '#FF6600', intensity: 0.15 },
    tags: ['fire', 'danger'],
    layer: 'condition',
  },
  freezable: {
    material: { roughness: 0.4 },
    tags: ['ice', 'interactive'],
    layer: 'condition',
  },
  electrifiable: {
    material: { roughness: 0.3, metalness: 0.5 },
    emissive: { color: '#88CCFF', intensity: 0.2 },
    tags: ['electric', 'conductive'],
    layer: 'visual_effect',
  },
  magnetic: {
    material: { roughness: 0.4, metalness: 0.7 },
    emissive: { color: '#4444FF', intensity: 0.15 },
    tags: ['metallic', 'force'],
    layer: 'visual_effect',
  },
  poisonous: {
    material: { roughness: 0.5, color: '#4A0044' },
    emissive: { color: '#88FF00', intensity: 0.25 },
    tags: ['danger', 'toxic'],
    layer: 'visual_effect',
  },
  radioactive: {
    material: { roughness: 0.4, color: '#2E4A0E' },
    emissive: { color: '#44FF00', intensity: 0.35 },
    particleEffect: 'radiation',
    tags: ['danger', 'glowing'],
    layer: 'visual_effect',
  },
  fragile: {
    material: { roughness: 0.2, transmission: 0.4, ior: 1.5 },
    tags: ['glass', 'breakable'],
    layer: 'physical',
  },
  repairable: {
    material: { roughness: 0.5 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['interactive', 'tool'],
    layer: 'condition',
  },
  upgradeable: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['interactive', 'progression'],
    layer: 'visual_effect',
  },
  lootable: {
    material: { roughness: 0.5 },
    emissive: { color: '#FFD700', intensity: 0.2 },
    tags: ['reward', 'interactive'],
    layer: 'visual_effect',
  },
  quest_item: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFCC00', intensity: 0.3 },
    tags: ['quest', 'important', 'glowing'],
    layer: 'visual_effect',
  },
  currency: {
    material: { roughness: 0.15, metalness: 0.8, color: '#FFD700', envMapIntensity: 1.3 },
    tags: ['metallic', 'valuable'],
    layer: 'base_material',
  },
  ammunition: {
    material: { roughness: 0.3, metalness: 0.7, color: '#B87333' },
    tags: ['metallic', 'small'],
    layer: 'base_material',
  },
  fuel: {
    material: { roughness: 0.4, color: '#4A3728' },
    emissive: { color: '#FF6600', intensity: 0.1 },
    tags: ['liquid', 'flammable'],
    layer: 'base_material',
  },
  key_item: {
    material: { roughness: 0.2, metalness: 0.6, color: '#FFD700' },
    emissive: { color: '#FFD700', intensity: 0.25 },
    tags: ['quest', 'metallic', 'important'],
    layer: 'visual_effect',
  },
  power_up: {
    material: { roughness: 0.2 },
    emissive: { color: '#44FF88', intensity: 0.4 },
    tags: ['reward', 'glowing', 'animated'],
    layer: 'visual_effect',
  },
  debuff: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF4444', intensity: 0.3 },
    tags: ['negative', 'status'],
    layer: 'visual_effect',
  },
  shield: {
    material: { roughness: 0.2, metalness: 0.5 },
    emissive: { color: '#4488FF', intensity: 0.25 },
    opacity: 0.8,
    tags: ['defensive', 'metallic'],
    layer: 'visual_effect',
  },
  weapon: {
    material: { roughness: 0.3, metalness: 0.7, color: '#555555' },
    tags: ['metallic', 'combat'],
    layer: 'base_material',
  },
  armor: {
    material: { roughness: 0.3, metalness: 0.8, color: '#708090' },
    tags: ['metallic', 'defensive', 'wearable'],
    layer: 'base_material',
  },
  tool: {
    material: { roughness: 0.4, metalness: 0.5, color: '#666666' },
    tags: ['metallic', 'interactive'],
    layer: 'base_material',
  },
  vehicle: {
    material: { roughness: 0.3, metalness: 0.6, color: '#333333' },
    tags: ['metallic', 'transport'],
    layer: 'base_material',
  },
  projectile: {
    material: { roughness: 0.3, metalness: 0.5 },
    emissive: { color: '#FF8800', intensity: 0.2 },
    tags: ['fast', 'dynamic'],
    layer: 'visual_effect',
  },
  trap: {
    material: { roughness: 0.6, color: '#4A3728' },
    tags: ['hidden', 'danger'],
    layer: 'physical',
  },
  puzzle_piece: {
    material: { roughness: 0.4, color: '#8B6914' },
    emissive: { color: '#FFCC44', intensity: 0.1 },
    tags: ['interactive', 'puzzle'],
    layer: 'physical',
  },
};
