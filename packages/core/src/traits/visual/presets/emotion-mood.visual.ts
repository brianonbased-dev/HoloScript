import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for emotion & mood traits (20 traits).
 * Ambient color tinting and atmospheric mood overlays.
 */
export const EMOTION_MOOD_VISUALS: Record<string, TraitVisualConfig> = {
  happy: {
    emissive: { color: '#FFD700', intensity: 0.3 },
    material: { emissive: '#FFD700', emissiveIntensity: 0.3 },
    tags: ['warm', 'bright'],
    layer: 'mood',
  },
  sad: {
    material: { color: '#4A6B8A' },
    emissive: { color: '#3366AA', intensity: 0.15 },
    tags: ['cool', 'muted'],
    layer: 'mood',
  },
  angry: {
    emissive: { color: '#FF2200', intensity: 0.5 },
    material: { emissive: '#FF2200', emissiveIntensity: 0.5 },
    tags: ['hot', 'intense'],
    layer: 'mood',
  },
  scared: {
    material: { color: '#2C2C3E' },
    emissive: { color: '#6666AA', intensity: 0.1 },
    tags: ['dark', 'cold'],
    layer: 'mood',
  },
  surprised: {
    emissive: { color: '#FFFF00', intensity: 0.6 },
    material: { emissive: '#FFFF00', emissiveIntensity: 0.6 },
    tags: ['bright', 'flash'],
    layer: 'mood',
  },
  disgusted: {
    material: { color: '#556B2F' },
    emissive: { color: '#7CCD7C', intensity: 0.15 },
    tags: ['sickly', 'muted'],
    layer: 'mood',
  },
  calm: {
    emissive: { color: '#87CEEB', intensity: 0.15 },
    material: { emissive: '#87CEEB', emissiveIntensity: 0.15 },
    tags: ['cool', 'serene'],
    layer: 'mood',
  },
  excited: {
    emissive: { color: '#FF6600', intensity: 0.5 },
    material: { emissive: '#FF6600', emissiveIntensity: 0.5 },
    tags: ['warm', 'vibrant'],
    layer: 'mood',
  },
  bored: {
    material: { roughness: 0.9, color: '#A0A0A0' },
    tags: ['muted', 'grey'],
    layer: 'mood',
  },
  nostalgic: {
    material: { color: '#C4956A' },
    emissive: { color: '#DEB887', intensity: 0.15 },
    tags: ['warm', 'vintage'],
    layer: 'mood',
  },
  eerie: {
    emissive: { color: '#4B0082', intensity: 0.3 },
    material: { emissive: '#4B0082', emissiveIntensity: 0.3, color: '#1A1A2E' },
    tags: ['dark', 'supernatural'],
    layer: 'mood',
  },
  serene: {
    emissive: { color: '#E0F0FF', intensity: 0.1 },
    material: { emissive: '#E0F0FF', emissiveIntensity: 0.1 },
    tags: ['calm', 'light'],
    layer: 'mood',
  },
  chaotic: {
    emissive: { color: '#FF00FF', intensity: 0.6 },
    material: { emissive: '#FF00FF', emissiveIntensity: 0.6 },
    tags: ['vibrant', 'unstable'],
    layer: 'mood',
  },
  melancholic: {
    material: { color: '#3C4F65' },
    emissive: { color: '#4466AA', intensity: 0.1 },
    tags: ['cool', 'subdued'],
    layer: 'mood',
  },
  triumphant: {
    emissive: { color: '#FFD700', intensity: 0.7 },
    material: { emissive: '#FFD700', emissiveIntensity: 0.7, metalness: 0.3 },
    tags: ['warm', 'golden'],
    layer: 'mood',
  },
  ominous: {
    emissive: { color: '#660000', intensity: 0.3 },
    material: { emissive: '#660000', emissiveIntensity: 0.3, color: '#1A0A0A' },
    tags: ['dark', 'threatening'],
    layer: 'mood',
  },
  whimsical: {
    emissive: { color: '#FF69B4', intensity: 0.3 },
    material: { emissive: '#FF69B4', emissiveIntensity: 0.3 },
    tags: ['playful', 'colorful'],
    layer: 'mood',
  },
  cozy: {
    emissive: { color: '#FF9933', intensity: 0.2 },
    material: { emissive: '#FF9933', emissiveIntensity: 0.2, roughness: 0.8 },
    tags: ['warm', 'soft'],
    layer: 'mood',
  },
  desolate: {
    material: { color: '#5C5C5C', roughness: 0.9 },
    tags: ['grey', 'empty'],
    layer: 'mood',
  },
  majestic: {
    emissive: { color: '#FFD700', intensity: 0.4 },
    material: { emissive: '#FFD700', emissiveIntensity: 0.4, metalness: 0.2, envMapIntensity: 1.3 },
    tags: ['golden', 'grand'],
    layer: 'mood',
  },
};
