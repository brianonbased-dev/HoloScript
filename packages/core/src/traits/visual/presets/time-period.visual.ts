import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for time period & era traits (23 traits).
 * Color palettes and material feel for historical/futuristic eras.
 */
export const TIME_PERIOD_VISUALS: Record<string, TraitVisualConfig> = {
  prehistoric: {
    material: { roughness: 0.95, color: '#6B4423' },
    tags: ['rough', 'natural'],
    layer: 'environmental',
  },
  ancient_era: {
    material: { roughness: 0.7, color: '#C4A35A' },
    tags: ['stone', 'weathered'],
    layer: 'environmental',
  },
  classical: {
    material: { roughness: 0.3, color: '#F0EDE6' },
    tags: ['marble', 'elegant'],
    layer: 'environmental',
  },
  bronze_age: {
    material: { roughness: 0.4, metalness: 0.8, color: '#CD7F32' },
    tags: ['metallic', 'ancient'],
    layer: 'environmental',
  },
  iron_age: {
    material: { roughness: 0.5, metalness: 0.7, color: '#434343' },
    tags: ['metallic', 'utilitarian'],
    layer: 'environmental',
  },
  viking: {
    material: { roughness: 0.7, color: '#5C3A21' },
    tags: ['wooden', 'rugged'],
    layer: 'environmental',
  },
  feudal: {
    material: { roughness: 0.6, color: '#808080', metalness: 0.2 },
    tags: ['stone', 'fortified'],
    layer: 'environmental',
  },
  renaissance: {
    material: { roughness: 0.3, color: '#DEB887', metalness: 0.1 },
    tags: ['ornate', 'gilded'],
    layer: 'environmental',
  },
  colonial: {
    material: { roughness: 0.6, color: '#8B6914' },
    tags: ['wooden', 'painted'],
    layer: 'environmental',
  },
  industrial: {
    material: { roughness: 0.5, metalness: 0.7, color: '#696969' },
    tags: ['metallic', 'sooty'],
    layer: 'environmental',
  },
  victorian: {
    material: { roughness: 0.4, color: '#5C3A21', metalness: 0.2 },
    tags: ['ornate', 'dark'],
    layer: 'environmental',
  },
  art_deco: {
    material: { roughness: 0.1, metalness: 0.5, color: '#FFD700', envMapIntensity: 1.5 },
    tags: ['glamorous', 'geometric'],
    layer: 'environmental',
  },
  art_nouveau: {
    material: { roughness: 0.3, color: '#8FBC8F' },
    tags: ['organic', 'elegant'],
    layer: 'environmental',
  },
  modern: {
    material: { roughness: 0.2, metalness: 0.3, color: '#E8E8E8' },
    tags: ['clean', 'minimal'],
    layer: 'environmental',
  },
  contemporary: {
    material: { roughness: 0.15, metalness: 0.2, color: '#F5F5F5' },
    tags: ['clean', 'sleek'],
    layer: 'environmental',
  },
  retro: {
    material: { roughness: 0.5, color: '#FF6347' },
    tags: ['colorful', 'nostalgic'],
    layer: 'environmental',
  },
  vintage: {
    material: { roughness: 0.6, color: '#C4956A' },
    tags: ['warm', 'aged'],
    layer: 'environmental',
  },
  post_apocalyptic: {
    material: { roughness: 0.9, color: '#5C5C5C' },
    tags: ['ruined', 'dusty'],
    layer: 'environmental',
  },
  dystopian: {
    material: { roughness: 0.4, metalness: 0.3, color: '#2C2C3E' },
    emissive: { color: '#FF0000', intensity: 0.2 },
    tags: ['dark', 'oppressive'],
    layer: 'environmental',
  },
  utopian: {
    material: { roughness: 0.1, color: '#F0F8FF', envMapIntensity: 1.2 },
    emissive: { color: '#E0F0FF', intensity: 0.15 },
    tags: ['clean', 'bright'],
    layer: 'environmental',
  },
  far_future: {
    material: { roughness: 0.05, metalness: 0.4, envMapIntensity: 1.5 },
    emissive: { color: '#00CCFF', intensity: 0.3 },
    tags: ['scifi', 'sleek'],
    layer: 'environmental',
  },
  timeless: {
    material: { roughness: 0.3, color: '#E0D8C8' },
    tags: ['neutral', 'classic'],
    layer: 'environmental',
  },
  anachronistic: {
    material: { iridescence: 0.5 },
    tags: ['mixed', 'unusual'],
    layer: 'environmental',
  },
};
