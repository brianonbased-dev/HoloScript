import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for weather/particle-emitter traits (12 traits).
 * Weather and particle emitter traits.
 */
export const WEATHER_PARTICLES_VISUALS: Record<string, TraitVisualConfig> = {
  rain_emitter: {
    material: { roughness: 0.2, color: '#88AACC' },
    particleEffect: 'rain',
    tags: ['weather', 'water'],
    layer: 'visual_effect',
  },
  snow_emitter: {
    material: { roughness: 0.3, color: '#F0F8FF' },
    particleEffect: 'snow',
    tags: ['weather', 'cold'],
    layer: 'visual_effect',
  },
  fog_emitter: {
    material: { roughness: 0.5 },
    opacity: 0.4,
    particleEffect: 'fog',
    tags: ['weather', 'atmospheric'],
    layer: 'visual_effect',
  },
  dust_emitter: {
    material: { roughness: 0.7, color: '#C4B99A' },
    particleEffect: 'dust',
    tags: ['weather', 'dry'],
    layer: 'visual_effect',
  },
  spark_emitter: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFAA44', intensity: 0.4 },
    particleEffect: 'sparks',
    tags: ['fire', 'hot'],
    layer: 'visual_effect',
  },
  bubble_emitter: {
    material: { roughness: 0.1, transmission: 0.6, ior: 1.3 },
    particleEffect: 'bubbles',
    tags: ['water', 'transparent'],
    layer: 'visual_effect',
  },
  smoke_emitter: {
    material: { roughness: 0.6, color: '#555555' },
    opacity: 0.6,
    particleEffect: 'smoke',
    tags: ['fire', 'atmospheric'],
    layer: 'visual_effect',
  },
  fire_emitter: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF4400', intensity: 0.5 },
    particleEffect: 'fire',
    tags: ['fire', 'hot', 'bright'],
    layer: 'visual_effect',
  },
  magic_emitter: {
    material: { roughness: 0.2 },
    emissive: { color: '#AA44FF', intensity: 0.4 },
    particleEffect: 'magic',
    tags: ['magic', 'mystical'],
    layer: 'visual_effect',
  },
  confetti_emitter: {
    material: { roughness: 0.4 },
    particleEffect: 'confetti',
    tags: ['celebration', 'colorful'],
    layer: 'visual_effect',
  },
  pollen_emitter: {
    material: { roughness: 0.5, color: '#FFEE88' },
    particleEffect: 'pollen',
    tags: ['nature', 'organic'],
    layer: 'visual_effect',
  },
  firefly_emitter: {
    material: { roughness: 0.3 },
    emissive: { color: '#CCFF44', intensity: 0.3 },
    particleEffect: 'fireflies',
    tags: ['nature', 'glowing', 'night'],
    layer: 'visual_effect',
  },
};
