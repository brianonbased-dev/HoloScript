import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for multisensory and haptic traits (16 traits).
 * Sensory properties of surfaces and materials.
 */
export const MULTISENSORY_HAPTIC_VISUALS: Record<string, TraitVisualConfig> = {
  scented: {
    material: { roughness: 0.5 },
    particleEffect: 'fragrance',
    tags: ['aromatic', 'sensory'],
    layer: 'surface',
  },
  tasteable: {
    material: { roughness: 0.5 },
    tags: ['food', 'sensory'],
    layer: 'surface',
  },
  temperature: {
    material: { roughness: 0.5 },
    tags: ['thermal', 'sensory'],
    layer: 'surface',
  },
  pressure_sensitive: {
    material: { roughness: 0.4 },
    tags: ['responsive', 'interactive'],
    layer: 'surface',
  },
  wind_effect: {
    material: { roughness: 0.3 },
    particleEffect: 'wind',
    tags: ['atmospheric', 'dynamic'],
    layer: 'environmental',
  },
  wet: {
    material: { roughness: 0.1, envMapIntensity: 1.4 },
    tags: ['water', 'reflective'],
    layer: 'surface',
  },
  dry: {
    material: { roughness: 0.8 },
    tags: ['arid', 'rough'],
    layer: 'surface',
  },
  rough: {
    material: { roughness: 0.9 },
    tags: ['textured', 'grip'],
    layer: 'surface',
  },
  smooth: {
    material: { roughness: 0.1 },
    tags: ['polished', 'slick'],
    layer: 'surface',
  },
  sticky: {
    material: { roughness: 0.9 },
    tags: ['adhesive', 'slow'],
    layer: 'surface',
  },
  slippery: {
    material: { roughness: 0.05, envMapIntensity: 1.3 },
    tags: ['smooth', 'dangerous'],
    layer: 'surface',
  },
  vibrating: {
    material: { roughness: 0.5 },
    emissive: { color: '#FFCC44', intensity: 0.1 },
    tags: ['haptic', 'dynamic'],
    layer: 'surface',
  },
  warm: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF8844', intensity: 0.1 },
    tags: ['thermal', 'hot'],
    layer: 'surface',
  },
  cold: {
    material: { roughness: 0.4, color: '#D6EAF8' },
    tags: ['thermal', 'ice'],
    layer: 'surface',
  },
  electric_sensation: {
    material: { roughness: 0.3 },
    emissive: { color: '#88CCFF', intensity: 0.2 },
    tags: ['electric', 'haptic'],
    layer: 'surface',
  },
  tingling: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC88', intensity: 0.1 },
    tags: ['haptic', 'mild'],
    layer: 'surface',
  },
};
