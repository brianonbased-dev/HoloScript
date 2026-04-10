import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for signs and communication traits (33 traits).
 * Signs, labels, and communication objects.
 */
export const SIGNS_COMMUNICATION_VISUALS: Record<string, TraitVisualConfig> = {
  sign: {
    material: { roughness: 0.4, color: '#FFFFFF' },
    tags: ['readable', 'flat'],
    layer: 'visual_effect',
  },
  label: {
    material: { roughness: 0.4, color: '#F5F5F5' },
    tags: ['text', 'small'],
    layer: 'visual_effect',
  },
  plaque: {
    material: { roughness: 0.3, metalness: 0.6, color: '#B87333' },
    tags: ['metallic', 'readable'],
    layer: 'base_material',
  },
  billboard_sign: {
    material: { roughness: 0.4, color: '#FFFFFF' },
    emissive: { color: '#FFFFFF', intensity: 0.2 },
    tags: ['large', 'display'],
    layer: 'visual_effect',
  },
  map: {
    material: { roughness: 0.6, color: '#D4C5A0' },
    tags: ['paper', 'readable'],
    layer: 'base_material',
  },
  waypoint: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.35 },
    tags: ['marker', 'glowing'],
    layer: 'lighting',
  },
  information_kiosk: {
    material: { roughness: 0.3, color: '#E8E8E8' },
    emissive: { color: '#4488FF', intensity: 0.2 },
    tags: ['electronic', 'display'],
    layer: 'visual_effect',
  },
  direction_arrow: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FF88', intensity: 0.3 },
    tags: ['marker', 'navigation'],
    layer: 'visual_effect',
  },
  warning_sign: {
    material: { roughness: 0.4, color: '#FFD700' },
    emissive: { color: '#FF8800', intensity: 0.25 },
    tags: ['alert', 'safety'],
    layer: 'visual_effect',
  },
  exit_sign: {
    material: { roughness: 0.3, color: '#00CC00' },
    emissive: { color: '#00FF00', intensity: 0.3 },
    tags: ['safety', 'glowing'],
    layer: 'lighting',
  },
  name_tag: {
    material: { roughness: 0.4, color: '#F5F5F5' },
    tags: ['text', 'small', 'wearable'],
    layer: 'visual_effect',
  },
  speech_bubble: {
    material: { roughness: 0.3, color: '#FFFFFF' },
    opacity: 0.9,
    tags: ['ui', 'communication'],
    layer: 'visual_effect',
  },
  thought_bubble: {
    material: { roughness: 0.3, color: '#E8E8FF' },
    opacity: 0.8,
    tags: ['ui', 'communication'],
    layer: 'visual_effect',
  },
  exclamation_mark: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFDD00', intensity: 0.4 },
    tags: ['alert', 'marker'],
    layer: 'lighting',
  },
  question_mark: {
    material: { roughness: 0.3 },
    emissive: { color: '#4488FF', intensity: 0.3 },
    tags: ['query', 'marker'],
    layer: 'lighting',
  },
  icon: {
    material: { roughness: 0.3 },
    tags: ['ui', 'symbol'],
    layer: 'visual_effect',
  },
  symbol: {
    material: { roughness: 0.3 },
    tags: ['ui', 'abstract'],
    layer: 'visual_effect',
  },
  logo: {
    material: { roughness: 0.3 },
    tags: ['branding', 'flat'],
    layer: 'visual_effect',
  },
  graffiti: {
    material: { roughness: 0.8 },
    tags: ['surface', 'painted', 'urban'],
    layer: 'surface',
  },
  inscription: {
    material: { roughness: 0.6, color: '#8B8378' },
    tags: ['carved', 'ancient'],
    layer: 'surface',
  },
  scroll: {
    material: { roughness: 0.7, color: '#D4C5A0' },
    tags: ['paper', 'ancient', 'readable'],
    layer: 'base_material',
  },
  book: {
    material: { roughness: 0.6, color: '#8B4513' },
    tags: ['paper', 'readable', 'leather'],
    layer: 'base_material',
  },
  newspaper: {
    material: { roughness: 0.8, color: '#E8E0D0' },
    tags: ['paper', 'readable', 'thin'],
    layer: 'base_material',
  },
  letter: {
    material: { roughness: 0.7, color: '#FFFFF0' },
    tags: ['paper', 'readable'],
    layer: 'base_material',
  },
  postcard: {
    material: { roughness: 0.6, color: '#F5F5F0' },
    tags: ['paper', 'small'],
    layer: 'base_material',
  },
  telegram: {
    material: { roughness: 0.7, color: '#F5F0E0' },
    tags: ['paper', 'aged'],
    layer: 'base_material',
  },
  holographic_display: {
    material: { roughness: 0.1 },
    opacity: 0.6,
    emissive: { color: '#44CCFF', intensity: 0.4 },
    tags: ['holographic', 'display', 'transparent'],
    layer: 'visual_effect',
  },
  heads_up_display: {
    material: { roughness: 0.1 },
    opacity: 0.5,
    emissive: { color: '#44FF88', intensity: 0.3 },
    tags: ['ui', 'transparent', 'display'],
    layer: 'visual_effect',
  },
};
