import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for environmental & biome traits (33 traits).
 * Biome-influenced color palettes and atmospheric effects.
 */
export const ENVIRONMENTAL_BIOME_VISUALS: Record<string, TraitVisualConfig> = {
  weather_source: {
    particleEffect: 'weather',
    tags: ['atmospheric'],
    layer: 'environmental',
  },
  day_night: {
    tags: ['cycle', 'temporal'],
    layer: 'environmental',
  },
  seasonal: {
    tags: ['cycle', 'temporal'],
    layer: 'environmental',
  },
  underwater: {
    material: { color: '#006994', transparent: true, opacity: 0.8 },
    tags: ['water', 'depth'],
    layer: 'environmental',
  },
  zero_gravity: {
    tags: ['space', 'floating'],
    layer: 'environmental',
  },
  low_gravity: {
    tags: ['space', 'light'],
    layer: 'environmental',
  },
  high_gravity: {
    tags: ['heavy', 'dense'],
    layer: 'environmental',
  },
  foggy: {
    material: { transparent: true, opacity: 0.7, color: '#C0C0C0' },
    tags: ['atmospheric', 'obscured'],
    layer: 'environmental',
  },
  icy: {
    material: { roughness: 0.1, color: '#D6EAF8', envMapIntensity: 1.2, transmission: 0.3 },
    tags: ['cold', 'slippery'],
    layer: 'environmental',
  },
  volcanic: {
    emissive: { color: '#FF4500', intensity: 1.5 },
    material: { emissive: '#FF4500', emissiveIntensity: 1.5, color: '#3C1414', roughness: 0.9 },
    tags: ['hot', 'destructive'],
    layer: 'environmental',
  },
  overgrown: {
    material: { roughness: 0.9, color: '#2E8B57' },
    tags: ['organic', 'nature'],
    layer: 'environmental',
  },
  enchanted: {
    emissive: { color: '#9966FF', intensity: 0.5 },
    material: { emissive: '#9966FF', emissiveIntensity: 0.5 },
    particleEffect: 'sparkles',
    tags: ['magical', 'emissive'],
    layer: 'environmental',
  },
  corrupted: {
    emissive: { color: '#8B008B', intensity: 0.4 },
    material: { emissive: '#8B008B', emissiveIntensity: 0.4, color: '#2A0A2A' },
    tags: ['dark', 'magical'],
    layer: 'environmental',
  },
  sacred: {
    emissive: { color: '#FFD700', intensity: 0.6 },
    material: { emissive: '#FFD700', emissiveIntensity: 0.6 },
    particleEffect: 'divine_light',
    tags: ['holy', 'emissive'],
    layer: 'environmental',
  },
  haunted: {
    emissive: { color: '#4B0082', intensity: 0.2 },
    material: {
      emissive: '#4B0082',
      emissiveIntensity: 0.2,
      color: '#1A1A2E',
      transparent: true,
      opacity: 0.85,
    },
    tags: ['dark', 'supernatural'],
    layer: 'environmental',
  },
  toxic: {
    emissive: { color: '#00FF00', intensity: 0.6 },
    material: { emissive: '#00FF00', emissiveIntensity: 0.6, color: '#3A5A1A' },
    particleEffect: 'toxic_fumes',
    tags: ['danger', 'chemical'],
    layer: 'environmental',
  },
  subterranean: {
    material: { color: '#3C2415', roughness: 0.9 },
    tags: ['dark', 'underground'],
    layer: 'environmental',
  },
  celestial: {
    emissive: { color: '#E0E0FF', intensity: 0.8 },
    material: { emissive: '#E0E0FF', emissiveIntensity: 0.8, metalness: 0.2 },
    tags: ['divine', 'emissive'],
    layer: 'environmental',
  },
  abyssal: {
    material: { color: '#0A0A1A', roughness: 0.5 },
    emissive: { color: '#000033', intensity: 0.1 },
    tags: ['deep', 'dark'],
    layer: 'environmental',
  },
  crystalline_biome: {
    material: { roughness: 0.0, metalness: 0.1, transmission: 0.7, ior: 1.8, iridescence: 0.5 },
    tags: ['mineral', 'reflective'],
    layer: 'environmental',
  },
  desert: {
    material: { roughness: 0.95, color: '#C4A35A' },
    tags: ['dry', 'hot'],
    layer: 'environmental',
  },
  tundra: {
    material: { roughness: 0.8, color: '#D4D4D4' },
    tags: ['cold', 'barren'],
    layer: 'environmental',
  },
  swamp: {
    material: { roughness: 0.9, color: '#4A5D23', envMapIntensity: 0.5 },
    tags: ['wet', 'murky'],
    layer: 'environmental',
  },
  forest: {
    material: { roughness: 0.8, color: '#228B22' },
    tags: ['nature', 'organic'],
    layer: 'environmental',
  },
  urban: {
    material: { roughness: 0.7, color: '#808080', metalness: 0.2 },
    tags: ['constructed', 'modern'],
    layer: 'environmental',
  },
  ruins: {
    material: { roughness: 0.9, color: '#8B8378' },
    tags: ['ancient', 'crumbling'],
    layer: 'environmental',
  },
  futuristic: {
    material: { roughness: 0.1, metalness: 0.5, envMapIntensity: 1.5 },
    emissive: { color: '#00CCFF', intensity: 0.3 },
    tags: ['scifi', 'reflective'],
    layer: 'environmental',
  },
  steampunk: {
    material: { roughness: 0.4, metalness: 0.8, color: '#B87333' },
    tags: ['metallic', 'vintage'],
    layer: 'environmental',
  },
  cyberpunk: {
    emissive: { color: '#FF00FF', intensity: 0.8 },
    material: { emissive: '#FF00FF', emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.1 },
    tags: ['neon', 'scifi'],
    layer: 'environmental',
  },
  medieval: {
    material: { roughness: 0.8, metalness: 0.1, color: '#6B4423' },
    tags: ['historical', 'organic'],
    layer: 'environmental',
  },
  alien: {
    emissive: { color: '#00FF88', intensity: 0.5 },
    material: { emissive: '#00FF88', emissiveIntensity: 0.5, iridescence: 0.7 },
    tags: ['exotic', 'bioluminescent'],
    layer: 'environmental',
  },
  dream: {
    material: {
      transparent: true,
      opacity: 0.7,
      emissive: '#E6E6FA',
      emissiveIntensity: 0.3,
      roughness: 0.0,
    },
    tags: ['ethereal', 'surreal'],
    layer: 'environmental',
  },
  void: {
    material: { color: '#000000', roughness: 1.0, metalness: 0.0 },
    tags: ['empty', 'dark'],
    layer: 'environmental',
  },
};
