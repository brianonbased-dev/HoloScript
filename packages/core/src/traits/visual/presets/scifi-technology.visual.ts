import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for sci-fi & technology traits (24 traits).
 */
export const SCIFI_TECHNOLOGY_VISUALS: Record<string, TraitVisualConfig> = {
  hologram: {
    material: {
      roughness: 0.0,
      metalness: 0.3,
      transparent: true,
      opacity: 0.6,
      emissive: '#00CCFF',
      emissiveIntensity: 1.0,
    },
    shader: 'hologram',
    tags: ['scifi', 'transparent'],
    layer: 'visual_effect',
  },
  force_field_tech: {
    emissive: { color: '#00CCFF', intensity: 1.0 },
    material: { emissive: '#00CCFF', emissiveIntensity: 1.0, transparent: true, opacity: 0.25 },
    shader: 'forceField',
    tags: ['scifi', 'protective'],
    layer: 'visual_effect',
  },
  cloaking: {
    material: { transparent: true, opacity: 0.08, envMapIntensity: 2.0 },
    tags: ['scifi', 'stealth'],
    layer: 'visual_effect',
  },
  energy_weapon: {
    emissive: { color: '#FF3300', intensity: 2.5 },
    material: { emissive: '#FF3300', emissiveIntensity: 2.5 },
    tags: ['scifi', 'weapon'],
    layer: 'visual_effect',
  },
  plasma: {
    emissive: { color: '#FF00FF', intensity: 2.0 },
    material: { emissive: '#FF00FF', emissiveIntensity: 2.0, transparent: true, opacity: 0.7 },
    tags: ['scifi', 'hot'],
    layer: 'visual_effect',
  },
  laser: {
    emissive: { color: '#FF0000', intensity: 3.0 },
    material: { emissive: '#FF0000', emissiveIntensity: 3.0 },
    tags: ['scifi', 'bright'],
    layer: 'visual_effect',
  },
  emp: {
    emissive: { color: '#00AAFF', intensity: 2.0 },
    particleEffect: 'emp_pulse',
    tags: ['scifi', 'electric'],
    layer: 'visual_effect',
  },
  nanite: {
    material: { metalness: 0.8, roughness: 0.1, color: '#808080', envMapIntensity: 1.5 },
    emissive: { color: '#00FF88', intensity: 0.3 },
    tags: ['scifi', 'metallic'],
    layer: 'base_material',
  },
  cybernetic: {
    material: { metalness: 0.7, roughness: 0.2, color: '#4A4A5A' },
    emissive: { color: '#00CCFF', intensity: 0.4 },
    tags: ['scifi', 'metallic'],
    layer: 'base_material',
  },
  biotech: {
    material: { roughness: 0.6, color: '#3A5A3A' },
    emissive: { color: '#00FF44', intensity: 0.3 },
    tags: ['scifi', 'organic'],
    layer: 'base_material',
  },
  quantum_locked: {
    emissive: { color: '#AACCFF', intensity: 0.6 },
    material: { envMapIntensity: 2.0 },
    tags: ['scifi', 'frozen'],
    layer: 'visual_effect',
  },
  warp_drive: {
    emissive: { color: '#6633FF', intensity: 1.5 },
    particleEffect: 'warp',
    tags: ['scifi', 'spatial'],
    layer: 'visual_effect',
  },
  hyperspace: {
    emissive: { color: '#0066FF', intensity: 2.0 },
    material: { transparent: true, opacity: 0.5 },
    tags: ['scifi', 'spatial'],
    layer: 'visual_effect',
  },
  cryo: {
    material: { roughness: 0.1, color: '#B0E0E6', transmission: 0.5, ior: 1.31, transparent: true },
    tags: ['scifi', 'cold'],
    layer: 'visual_effect',
  },
  stasis: {
    material: { transparent: true, opacity: 0.4, emissive: '#AACCFF', emissiveIntensity: 0.3 },
    tags: ['scifi', 'frozen'],
    layer: 'visual_effect',
  },
  terraforming: {
    material: { roughness: 0.8, color: '#6B8E23' },
    tags: ['scifi', 'earth'],
    layer: 'environmental',
  },
  atmospheric: {
    material: { transparent: true, opacity: 0.6, color: '#87CEEB' },
    tags: ['scifi', 'gas'],
    layer: 'environmental',
  },
  orbital: {
    material: { metalness: 0.7, roughness: 0.2, color: '#C0C0C0' },
    tags: ['scifi', 'space'],
    layer: 'base_material',
  },
  asteroid: {
    material: { roughness: 0.95, color: '#5C5C5C', metalness: 0.1 },
    tags: ['space', 'rock'],
    layer: 'base_material',
  },
  nebula: {
    emissive: { color: '#FF66CC', intensity: 0.8 },
    material: { transparent: true, opacity: 0.3, emissive: '#FF66CC', emissiveIntensity: 0.8 },
    tags: ['space', 'colorful'],
    layer: 'environmental',
  },
  black_hole: {
    material: { color: '#000000', roughness: 0.0 },
    emissive: { color: '#FF6600', intensity: 0.5 },
    tags: ['space', 'dark'],
    layer: 'environmental',
  },
  wormhole: {
    emissive: { color: '#9933FF', intensity: 1.5 },
    material: { transparent: true, opacity: 0.5, iridescence: 1.0 },
    tags: ['space', 'dimensional'],
    layer: 'visual_effect',
  },
  dyson_sphere: {
    material: { metalness: 0.9, roughness: 0.1, color: '#C0C0C0' },
    emissive: { color: '#FFCC00', intensity: 1.0 },
    tags: ['space', 'metallic'],
    layer: 'base_material',
  },
  ringworld: {
    material: { metalness: 0.5, roughness: 0.3, color: '#888888' },
    tags: ['space', 'constructed'],
    layer: 'base_material',
  },
};
