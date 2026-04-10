import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for magic & fantasy traits (37 traits).
 */
export const MAGIC_FANTASY_VISUALS: Record<string, TraitVisualConfig> = {
  enchantable: {
    emissive: { color: '#9966FF', intensity: 0.4 },
    material: { emissive: '#9966FF', emissiveIntensity: 0.4 },
    tags: ['magical'],
    layer: 'visual_effect',
  },
  cursed: {
    emissive: { color: '#8B0000', intensity: 0.5 },
    material: { emissive: '#8B0000', emissiveIntensity: 0.5, color: '#1A0A0A' },
    tags: ['dark', 'magical'],
    layer: 'visual_effect',
  },
  blessed: {
    emissive: { color: '#FFD700', intensity: 0.6 },
    material: { emissive: '#FFD700', emissiveIntensity: 0.6 },
    tags: ['holy', 'magical'],
    layer: 'visual_effect',
  },
  soul_bound: {
    emissive: { color: '#CC88FF', intensity: 0.3 },
    material: { emissive: '#CC88FF', emissiveIntensity: 0.3, transparent: true, opacity: 0.85 },
    tags: ['magical', 'ethereal'],
    layer: 'visual_effect',
  },
  elemental_fire: {
    emissive: { color: '#FF4500', intensity: 2.0 },
    material: { emissive: '#FF4500', emissiveIntensity: 2.0, color: '#FF6600' },
    particleEffect: 'fire',
    tags: ['hot', 'elemental'],
    layer: 'visual_effect',
  },
  elemental_water: {
    material: { color: '#1E90FF', transparent: true, opacity: 0.7, roughness: 0.0 },
    particleEffect: 'water',
    tags: ['cold', 'elemental'],
    layer: 'visual_effect',
  },
  elemental_earth: {
    material: { roughness: 0.95, color: '#8B6914', metalness: 0.0 },
    tags: ['solid', 'elemental'],
    layer: 'visual_effect',
  },
  elemental_air: {
    material: { transparent: true, opacity: 0.2 },
    particleEffect: 'wind',
    tags: ['transparent', 'elemental'],
    layer: 'visual_effect',
  },
  elemental_lightning: {
    emissive: { color: '#00BFFF', intensity: 3.0 },
    material: { emissive: '#00BFFF', emissiveIntensity: 3.0 },
    particleEffect: 'lightning',
    tags: ['electric', 'elemental'],
    layer: 'visual_effect',
  },
  elemental_ice: {
    material: { roughness: 0.1, color: '#D6EAF8', transmission: 0.6, ior: 1.31, transparent: true },
    tags: ['cold', 'elemental'],
    layer: 'visual_effect',
  },
  elemental_shadow: {
    material: { color: '#0A0A1A', roughness: 0.5 },
    emissive: { color: '#330066', intensity: 0.2 },
    tags: ['dark', 'elemental'],
    layer: 'visual_effect',
  },
  elemental_light: {
    emissive: { color: '#FFFFF0', intensity: 2.5 },
    material: { emissive: '#FFFFF0', emissiveIntensity: 2.5 },
    tags: ['bright', 'elemental'],
    layer: 'visual_effect',
  },
  summoning: {
    emissive: { color: '#9933FF', intensity: 1.0 },
    particleEffect: 'magic_circle',
    tags: ['magical'],
    layer: 'visual_effect',
  },
  banishing: {
    emissive: { color: '#FFFFFF', intensity: 2.0 },
    particleEffect: 'dispel',
    tags: ['holy', 'magical'],
    layer: 'visual_effect',
  },
  telekinetic: {
    emissive: { color: '#6699FF', intensity: 0.4 },
    tags: ['psionic'],
    layer: 'visual_effect',
  },
  telepathic: {
    emissive: { color: '#9999FF', intensity: 0.3 },
    tags: ['psionic'],
    layer: 'visual_effect',
  },
  healing_aura: {
    emissive: { color: '#00FF7F', intensity: 0.8 },
    material: { emissive: '#00FF7F', emissiveIntensity: 0.8 },
    particleEffect: 'healing',
    tags: ['holy', 'aura'],
    layer: 'visual_effect',
  },
  damage_aura: {
    emissive: { color: '#FF0000', intensity: 1.0 },
    material: { emissive: '#FF0000', emissiveIntensity: 1.0 },
    particleEffect: 'damage',
    tags: ['dark', 'aura'],
    layer: 'visual_effect',
  },
  shield_aura: {
    emissive: { color: '#4488FF', intensity: 0.6 },
    material: { emissive: '#4488FF', emissiveIntensity: 0.6, transparent: true, opacity: 0.4 },
    tags: ['protective', 'aura'],
    layer: 'visual_effect',
  },
  speed_aura: {
    emissive: { color: '#FFFF00', intensity: 0.5 },
    particleEffect: 'speed_lines',
    tags: ['buff', 'aura'],
    layer: 'visual_effect',
  },
  invisibility: {
    material: { transparent: true, opacity: 0.05 },
    tags: ['stealth', 'transparent'],
    layer: 'visual_effect',
  },
  time_slow: {
    material: { emissive: '#AADDFF', emissiveIntensity: 0.3 },
    tags: ['temporal'],
    layer: 'visual_effect',
  },
  time_stop: {
    material: { emissive: '#CCCCFF', emissiveIntensity: 0.5 },
    tags: ['temporal'],
    layer: 'visual_effect',
  },
  time_rewind: {
    material: { emissive: '#FFCC00', emissiveIntensity: 0.4 },
    tags: ['temporal'],
    layer: 'visual_effect',
  },
  portal_link: {
    emissive: { color: '#FF6600', intensity: 1.5 },
    material: { emissive: '#FF6600', emissiveIntensity: 1.5, transparent: true, opacity: 0.6 },
    tags: ['dimensional'],
    layer: 'visual_effect',
  },
  dimensional: {
    emissive: { color: '#9933CC', intensity: 0.8 },
    material: { transparent: true, opacity: 0.5, iridescence: 0.8 },
    tags: ['otherworldly'],
    layer: 'visual_effect',
  },
  gravity_well: {
    emissive: { color: '#3300CC', intensity: 0.6 },
    tags: ['force'],
    layer: 'visual_effect',
  },
  antigravity: {
    emissive: { color: '#66CCFF', intensity: 0.4 },
    tags: ['force'],
    layer: 'visual_effect',
  },
  force_field: {
    emissive: { color: '#00CCFF', intensity: 0.8 },
    material: { emissive: '#00CCFF', emissiveIntensity: 0.8, transparent: true, opacity: 0.3 },
    shader: 'forceField',
    tags: ['protective', 'transparent'],
    layer: 'visual_effect',
  },
  mana_source: {
    emissive: { color: '#6633FF', intensity: 1.0 },
    particleEffect: 'mana',
    tags: ['magical', 'emissive'],
    layer: 'visual_effect',
  },
  rune: {
    emissive: { color: '#4488FF', intensity: 0.6 },
    material: { emissive: '#4488FF', emissiveIntensity: 0.6 },
    tags: ['magical', 'inscription'],
    layer: 'visual_effect',
  },
  glyph: {
    emissive: { color: '#FF8800', intensity: 0.5 },
    tags: ['magical', 'inscription'],
    layer: 'visual_effect',
  },
  sigil: {
    emissive: { color: '#CC00CC', intensity: 0.7 },
    tags: ['magical', 'inscription'],
    layer: 'visual_effect',
  },
  totem: {
    material: { roughness: 0.8, color: '#6B4423' },
    emissive: { color: '#88FF44', intensity: 0.3 },
    tags: ['tribal', 'magical'],
    layer: 'base_material',
  },
  artifact: {
    material: { metalness: 0.5, roughness: 0.3, envMapIntensity: 1.5 },
    emissive: { color: '#FFD700', intensity: 0.3 },
    tags: ['ancient', 'magical'],
    layer: 'base_material',
  },
  relic: {
    material: { roughness: 0.5, color: '#B8860B', metalness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.2 },
    tags: ['ancient', 'holy'],
    layer: 'base_material',
  },
  phylactery: {
    emissive: { color: '#660066', intensity: 0.8 },
    material: { emissive: '#660066', emissiveIntensity: 0.8, color: '#1A0A1A' },
    tags: ['dark', 'magical'],
    layer: 'visual_effect',
  },
};
