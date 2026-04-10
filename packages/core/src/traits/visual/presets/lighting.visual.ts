import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for lighting traits (28 traits).
 * Light sources and illumination effects.
 */
export const LIGHTING_VISUALS: Record<string, TraitVisualConfig> = {
  shadow_caster: {
    material: {},
    tags: ['shadow'],
    layer: 'lighting',
  },
  light_source: {
    emissive: { color: '#FFFFFF', intensity: 1.5 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 1.5 },
    tags: ['emissive'],
    layer: 'lighting',
  },
  spotlight: {
    emissive: { color: '#FFFDE0', intensity: 2.0 },
    material: { emissive: '#FFFDE0', emissiveIntensity: 2.0 },
    tags: ['emissive', 'directional'],
    layer: 'lighting',
  },
  point_light: {
    emissive: { color: '#FFFFFF', intensity: 1.5 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 1.5 },
    tags: ['emissive', 'omnidirectional'],
    layer: 'lighting',
  },
  area_light: {
    emissive: { color: '#FFFFFF', intensity: 1.0 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 1.0 },
    tags: ['emissive', 'soft'],
    layer: 'lighting',
  },
  backlit: {
    emissive: { color: '#FFE4B5', intensity: 0.8 },
    material: { emissive: '#FFE4B5', emissiveIntensity: 0.8 },
    tags: ['emissive', 'rim'],
    layer: 'lighting',
  },
  candlelight: {
    emissive: { color: '#FF9933', intensity: 0.6 },
    material: { emissive: '#FF9933', emissiveIntensity: 0.6 },
    tags: ['emissive', 'warm', 'flickering'],
    layer: 'lighting',
  },
  torchlight: {
    emissive: { color: '#FF6600', intensity: 1.2 },
    material: { emissive: '#FF6600', emissiveIntensity: 1.2 },
    tags: ['emissive', 'warm', 'flickering'],
    layer: 'lighting',
  },
  lantern: {
    emissive: { color: '#FFB347', intensity: 0.8 },
    material: { emissive: '#FFB347', emissiveIntensity: 0.8 },
    tags: ['emissive', 'warm'],
    layer: 'lighting',
  },
  neon_sign: {
    emissive: { color: '#FF00FF', intensity: 2.5 },
    material: { emissive: '#FF00FF', emissiveIntensity: 2.5 },
    tags: ['emissive', 'vibrant'],
    layer: 'lighting',
  },
  fluorescent: {
    emissive: { color: '#F0F8FF', intensity: 1.0 },
    material: { emissive: '#F0F8FF', emissiveIntensity: 1.0 },
    tags: ['emissive', 'cool'],
    layer: 'lighting',
  },
  incandescent: {
    emissive: { color: '#FFD280', intensity: 0.8 },
    material: { emissive: '#FFD280', emissiveIntensity: 0.8 },
    tags: ['emissive', 'warm'],
    layer: 'lighting',
  },
  led: {
    emissive: { color: '#FFFFFF', intensity: 1.2 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 1.2 },
    tags: ['emissive', 'cool'],
    layer: 'lighting',
  },
  strobe: {
    emissive: { color: '#FFFFFF', intensity: 3.0 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 3.0 },
    tags: ['emissive', 'flashing'],
    layer: 'lighting',
  },
  blacklight: {
    emissive: { color: '#6600CC', intensity: 2.0 },
    material: { emissive: '#6600CC', emissiveIntensity: 2.0 },
    tags: ['emissive', 'uv'],
    layer: 'lighting',
  },
  floodlight: {
    emissive: { color: '#FFFFF0', intensity: 3.0 },
    material: { emissive: '#FFFFF0', emissiveIntensity: 3.0 },
    tags: ['emissive', 'bright'],
    layer: 'lighting',
  },
  chandelier: {
    emissive: { color: '#FFD700', intensity: 1.5 },
    material: { emissive: '#FFD700', emissiveIntensity: 1.5 },
    tags: ['emissive', 'warm', 'ornate'],
    layer: 'lighting',
  },
  lamp: {
    emissive: { color: '#FFF5E1', intensity: 0.7 },
    material: { emissive: '#FFF5E1', emissiveIntensity: 0.7 },
    tags: ['emissive', 'warm'],
    layer: 'lighting',
  },
  sconce: {
    emissive: { color: '#FFE0B2', intensity: 0.6 },
    material: { emissive: '#FFE0B2', emissiveIntensity: 0.6 },
    tags: ['emissive', 'wall-mounted'],
    layer: 'lighting',
  },
  light_strip: {
    emissive: { color: '#00FFFF', intensity: 1.0 },
    material: { emissive: '#00FFFF', emissiveIntensity: 1.0 },
    tags: ['emissive', 'linear'],
    layer: 'lighting',
  },
  projection: {
    emissive: { color: '#FFFFFF', intensity: 2.0 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 2.0 },
    tags: ['emissive', 'directional'],
    layer: 'lighting',
  },
  volumetric_light: {
    emissive: { color: '#FFFACD', intensity: 1.5 },
    material: { emissive: '#FFFACD', emissiveIntensity: 1.5 },
    tags: ['emissive', 'atmospheric'],
    layer: 'lighting',
  },
  caustics: {
    material: { envMapIntensity: 2.0 },
    tags: ['reflective', 'water'],
    layer: 'lighting',
  },
  god_rays: {
    emissive: { color: '#FFFDE0', intensity: 1.8 },
    material: { emissive: '#FFFDE0', emissiveIntensity: 1.8 },
    tags: ['emissive', 'atmospheric'],
    layer: 'lighting',
  },
  ambient_glow: {
    emissive: { color: '#E6E6FA', intensity: 0.4 },
    material: { emissive: '#E6E6FA', emissiveIntensity: 0.4 },
    tags: ['emissive', 'soft'],
    layer: 'lighting',
  },
  flickering: {
    emissive: { color: '#FF8C00', intensity: 1.0 },
    material: { emissive: '#FF8C00', emissiveIntensity: 1.0 },
    tags: ['emissive', 'animated'],
    layer: 'lighting',
  },
  dimmable: {
    emissive: { color: '#FFFFFF', intensity: 0.5 },
    material: { emissive: '#FFFFFF', emissiveIntensity: 0.5 },
    tags: ['emissive', 'adjustable'],
    layer: 'lighting',
  },
  color_temperature: {
    emissive: { color: '#FFE4C4', intensity: 0.7 },
    material: { emissive: '#FFE4C4', emissiveIntensity: 0.7 },
    tags: ['emissive', 'adjustable'],
    layer: 'lighting',
  },
};
