import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for visual-effects traits (30 traits).
 * Shaders, transparency, and special rendering effects.
 */
export const VISUAL_EFFECTS_VISUALS: Record<string, TraitVisualConfig> = {
  transparent: {
    material: { transparent: true, opacity: 0.5 },
    opacity: 0.5,
    tags: ['transparent'],
    layer: 'visual_effect',
  },
  reflective: {
    material: { metalness: 0.8, roughness: 0.05, envMapIntensity: 2.0 },
    tags: ['reflective', 'metallic'],
    layer: 'visual_effect',
  },
  emissive: {
    emissive: { color: '#FFFFFF', intensity: 1.5 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 1.5 },
    tags: ['emissive'],
    layer: 'visual_effect',
  },
  spinning: {
    tags: ['animated', 'rotation'],
    layer: 'visual_effect',
  },
  floating: {
    tags: ['animated', 'position'],
    layer: 'visual_effect',
  },
  pulsing: {
    emissive: { color: '#FFFFFF', intensity: 1.0 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 1.0 },
    tags: ['animated', 'emissive'],
    layer: 'visual_effect',
  },
  blinking: {
    tags: ['animated', 'visibility'],
    layer: 'visual_effect',
  },
  fading: {
    material: { transparent: true, opacity: 0.7 },
    tags: ['animated', 'transparent'],
    layer: 'visual_effect',
  },
  color_shifting: {
    tags: ['animated', 'color'],
    layer: 'visual_effect',
  },
  holographic: {
    material: {
      roughness: 0.0,
      metalness: 0.3,
      transparent: true,
      opacity: 0.6,
      emissive: '#00CCFF',
      emissiveIntensity: 1.0,
    },
    shader: 'hologram',
    tags: ['transparent', 'emissive', 'scifi'],
    layer: 'visual_effect',
  },
  outlined: {
    tags: ['post-process', 'edge'],
    layer: 'visual_effect',
  },
  x_ray: {
    material: { transparent: true, opacity: 0.3, emissive: '#00FF00', emissiveIntensity: 0.5 },
    tags: ['transparent', 'emissive'],
    layer: 'visual_effect',
  },
  neon_glow: {
    emissive: { color: '#FF00FF', intensity: 2.5 },
    material: { emissive: '#FF00FF', emissiveIntensity: 2.5, roughness: 0.0 },
    tags: ['emissive', 'vibrant'],
    layer: 'visual_effect',
  },
  iridescent: {
    material: { iridescence: 1.0, iridescenceIOR: 1.3, roughness: 0.1 },
    tags: ['iridescent', 'reflective'],
    layer: 'visual_effect',
  },
  frosted: {
    material: { roughness: 0.3, color: '#E8F4FD', transmission: 0.4, transparent: true },
    tags: ['translucent', 'cold'],
    layer: 'visual_effect',
  },
  luminous: {
    emissive: { color: '#FFFACD', intensity: 1.2 },
    material: { emissive: '#FFFACD', emissiveIntensity: 1.2 },
    tags: ['emissive', 'soft'],
    layer: 'visual_effect',
  },
  camouflaged: {
    material: { roughness: 0.8, metalness: 0.0, color: '#4A6741' },
    tags: ['stealth'],
    layer: 'visual_effect',
  },
  mirrored: {
    material: { roughness: 0.0, metalness: 1.0, envMapIntensity: 2.5 },
    tags: ['reflective', 'metallic'],
    layer: 'visual_effect',
  },
  pixelated: {
    tags: ['post-process', 'retro'],
    layer: 'visual_effect',
  },
  dissolving: {
    material: { transparent: true, opacity: 0.6 },
    shader: 'dissolve',
    tags: ['animated', 'transparent'],
    layer: 'visual_effect',
  },
  crystalline: {
    material: { roughness: 0.0, metalness: 0.1, transmission: 0.8, ior: 1.8, iridescence: 0.5 },
    tags: ['transparent', 'reflective', 'mineral'],
    layer: 'visual_effect',
  },
  ethereal: {
    material: { transparent: true, opacity: 0.4, emissive: '#E0E0FF', emissiveIntensity: 0.5 },
    tags: ['transparent', 'emissive', 'magical'],
    layer: 'visual_effect',
  },
  smoky: {
    material: { transparent: true, opacity: 0.5, color: '#444444' },
    particleEffect: 'smoke',
    tags: ['transparent', 'particle'],
    layer: 'visual_effect',
  },
  fiery: {
    emissive: { color: '#FF4500', intensity: 2.0 },
    material: { emissive: '#FF4500', emissiveIntensity: 2.0, color: '#FF6600' },
    particleEffect: 'fire',
    tags: ['emissive', 'particle', 'hot'],
    layer: 'visual_effect',
  },
  electric_arc: {
    emissive: { color: '#00BFFF', intensity: 3.0 },
    material: { emissive: '#00BFFF', emissiveIntensity: 3.0 },
    particleEffect: 'lightning',
    tags: ['emissive', 'particle', 'electric'],
    layer: 'visual_effect',
  },
  ghostly: {
    material: { transparent: true, opacity: 0.3, emissive: '#B0C4DE', emissiveIntensity: 0.3 },
    tags: ['transparent', 'emissive', 'supernatural'],
    layer: 'visual_effect',
  },
  rainbow: {
    material: { iridescence: 1.0, iridescenceIOR: 1.5, roughness: 0.1 },
    tags: ['iridescent', 'colorful'],
    layer: 'visual_effect',
  },
  metallic_sheen: {
    material: { metalness: 0.7, roughness: 0.2, envMapIntensity: 1.5 },
    tags: ['metallic', 'reflective'],
    layer: 'visual_effect',
  },
  ink_wash: {
    material: { roughness: 0.8, metalness: 0.0, color: '#2C2C2C' },
    tags: ['artistic', 'stylized'],
    layer: 'visual_effect',
  },
  cel_shaded: {
    tags: ['post-process', 'stylized', 'toon'],
    layer: 'visual_effect',
  },
};
