import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for mythical creature traits (42 traits).
 */
export const CREATURES_MYTHICAL_VISUALS: Record<string, TraitVisualConfig> = {
  dragon: {
    material: { roughness: 0.4, metalness: 0.15, color: '#8B0000' },
    emissive: { color: '#FF4500', intensity: 0.3 },
    tags: ['reptilian', 'fire'],
    layer: 'base_material',
  },
  phoenix: {
    emissive: { color: '#FF6600', intensity: 2.0 },
    material: { emissive: '#FF6600', emissiveIntensity: 2.0, color: '#FF4500' },
    particleEffect: 'fire',
    tags: ['fire', 'bird'],
    layer: 'base_material',
  },
  unicorn: {
    material: { roughness: 0.3, color: '#FFFFFF', iridescence: 0.5, envMapIntensity: 1.2 },
    tags: ['holy', 'magical'],
    layer: 'base_material',
  },
  griffin: {
    material: { roughness: 0.6, color: '#D4A017' },
    tags: ['feathered', 'noble'],
    layer: 'base_material',
  },
  hydra: {
    material: { roughness: 0.5, color: '#2E4E2E' },
    tags: ['reptilian', 'multi-headed'],
    layer: 'base_material',
  },
  kraken: {
    material: { roughness: 0.3, color: '#1A3A4A' },
    tags: ['aquatic', 'tentacled'],
    layer: 'base_material',
  },
  golem: {
    material: { roughness: 0.9, metalness: 0.0, color: '#8B7355' },
    tags: ['mineral', 'constructed'],
    layer: 'base_material',
  },
  wraith: {
    material: {
      transparent: true,
      opacity: 0.3,
      emissive: '#6666AA',
      emissiveIntensity: 0.4,
      color: '#1A1A2E',
    },
    tags: ['undead', 'ethereal'],
    layer: 'base_material',
  },
  lich: {
    emissive: { color: '#00FF88', intensity: 0.6 },
    material: { color: '#2A2A3A', emissive: '#00FF88', emissiveIntensity: 0.6 },
    tags: ['undead', 'magical'],
    layer: 'base_material',
  },
  vampire: {
    material: { roughness: 0.3, color: '#2C0A0A' },
    emissive: { color: '#FF0000', intensity: 0.2 },
    tags: ['undead', 'dark'],
    layer: 'base_material',
  },
  werewolf: {
    material: { roughness: 0.9, color: '#5C4033' },
    tags: ['beast', 'furry'],
    layer: 'base_material',
  },
  zombie: {
    material: { roughness: 0.8, color: '#6B7B5E' },
    tags: ['undead', 'decayed'],
    layer: 'base_material',
  },
  skeleton_creature: {
    material: { roughness: 0.6, color: '#E8DCC8' },
    tags: ['undead', 'bone'],
    layer: 'base_material',
  },
  ghost: {
    material: { transparent: true, opacity: 0.25, emissive: '#B0C4DE', emissiveIntensity: 0.3 },
    tags: ['undead', 'ethereal'],
    layer: 'base_material',
  },
  demon: {
    emissive: { color: '#FF0000', intensity: 0.8 },
    material: { color: '#3C0A0A', emissive: '#FF0000', emissiveIntensity: 0.8 },
    tags: ['dark', 'infernal'],
    layer: 'base_material',
  },
  angel: {
    emissive: { color: '#FFFFF0', intensity: 1.0 },
    material: { color: '#FFFFFF', emissive: '#FFFFF0', emissiveIntensity: 1.0 },
    tags: ['holy', 'divine'],
    layer: 'base_material',
  },
  fairy: {
    emissive: { color: '#FF69B4', intensity: 0.5 },
    material: { transparent: true, opacity: 0.7, iridescence: 0.8 },
    particleEffect: 'sparkles',
    tags: ['magical', 'tiny'],
    layer: 'base_material',
  },
  sprite: {
    emissive: { color: '#00FF88', intensity: 0.6 },
    material: { transparent: true, opacity: 0.5 },
    particleEffect: 'sparkles',
    tags: ['magical', 'nature'],
    layer: 'base_material',
  },
  pixie: {
    emissive: { color: '#FFD700', intensity: 0.4 },
    material: { transparent: true, opacity: 0.6, iridescence: 0.6 },
    tags: ['magical', 'tiny'],
    layer: 'base_material',
  },
  troll: {
    material: { roughness: 0.9, color: '#4A5A3A' },
    tags: ['monster', 'tough'],
    layer: 'base_material',
  },
  ogre: {
    material: { roughness: 0.85, color: '#5A6B3A' },
    tags: ['monster', 'large'],
    layer: 'base_material',
  },
  giant_creature: {
    material: { roughness: 0.7, color: '#7B7B6E' },
    scale: [5, 5, 5],
    tags: ['massive'],
    layer: 'base_material',
  },
  dwarf_creature: {
    material: { roughness: 0.6, metalness: 0.2, color: '#8B6914' },
    scale: [0.7, 0.7, 0.7],
    tags: ['small', 'sturdy'],
    layer: 'base_material',
  },
  elf: {
    material: { roughness: 0.3, color: '#F0EDE6' },
    tags: ['graceful', 'magical'],
    layer: 'base_material',
  },
  orc: {
    material: { roughness: 0.8, color: '#4A5A3A' },
    tags: ['beast', 'warrior'],
    layer: 'base_material',
  },
  goblin: {
    material: { roughness: 0.75, color: '#6B8E23' },
    scale: [0.6, 0.6, 0.6],
    tags: ['small', 'sneaky'],
    layer: 'base_material',
  },
  imp: {
    emissive: { color: '#FF3300', intensity: 0.3 },
    material: { color: '#5A1A1A' },
    scale: [0.4, 0.4, 0.4],
    tags: ['small', 'demonic'],
    layer: 'base_material',
  },
  minotaur: {
    material: { roughness: 0.7, color: '#6B4423' },
    scale: [2, 2.5, 2],
    tags: ['beast', 'large'],
    layer: 'base_material',
  },
  centaur: {
    material: { roughness: 0.6, color: '#8B6914' },
    tags: ['beast', 'noble'],
    layer: 'base_material',
  },
  mermaid: {
    material: { roughness: 0.2, color: '#48D1CC', iridescence: 0.5 },
    tags: ['aquatic', 'magical'],
    layer: 'base_material',
  },
  siren: {
    emissive: { color: '#CC66FF', intensity: 0.3 },
    material: { color: '#4A3A5A' },
    tags: ['aquatic', 'enchanting'],
    layer: 'base_material',
  },
  basilisk: {
    material: { roughness: 0.4, color: '#3A5A3A' },
    emissive: { color: '#00FF00', intensity: 0.3 },
    tags: ['reptilian', 'petrifying'],
    layer: 'base_material',
  },
  chimera: {
    material: { roughness: 0.6, color: '#8B4513' },
    tags: ['beast', 'multi-formed'],
    layer: 'base_material',
  },
  wyvern: {
    material: { roughness: 0.45, color: '#4A6B4A' },
    tags: ['reptilian', 'winged'],
    layer: 'base_material',
  },
  pegasus: {
    material: { roughness: 0.3, color: '#FFFFFF', envMapIntensity: 1.0 },
    tags: ['divine', 'winged'],
    layer: 'base_material',
  },
  cerberus: {
    material: { roughness: 0.7, color: '#2C2C2C' },
    emissive: { color: '#FF4500', intensity: 0.3 },
    tags: ['infernal', 'multi-headed'],
    layer: 'base_material',
  },
  sphinx: {
    material: { roughness: 0.5, color: '#C4A35A', metalness: 0.1 },
    tags: ['ancient', 'enigmatic'],
    layer: 'base_material',
  },
  djinn: {
    emissive: { color: '#FF8800', intensity: 0.8 },
    material: { transparent: true, opacity: 0.6, emissive: '#FF8800', emissiveIntensity: 0.8 },
    particleEffect: 'smoke',
    tags: ['magical', 'ethereal'],
    layer: 'base_material',
  },
  elemental_creature: {
    emissive: { color: '#00CCFF', intensity: 0.6 },
    material: { transparent: true, opacity: 0.5 },
    tags: ['elemental'],
    layer: 'base_material',
  },
  treant: {
    material: { roughness: 0.9, color: '#4A3A1A' },
    tags: ['nature', 'wooden'],
    layer: 'base_material',
  },
  slime: {
    material: {
      roughness: 0.0,
      color: '#7CCD7C',
      transparent: true,
      opacity: 0.6,
      envMapIntensity: 1.2,
    },
    tags: ['translucent', 'amorphous'],
    layer: 'base_material',
  },
  mimic: {
    material: { roughness: 0.7, color: '#8B6914', metalness: 0.1 },
    tags: ['deceptive'],
    layer: 'base_material',
  },
};
