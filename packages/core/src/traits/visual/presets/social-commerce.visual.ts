import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for social/commerce traits (12 traits).
 * Commerce and trade visual indicators for marketplace items.
 */
export const SOCIAL_COMMERCE_VISUALS: Record<string, TraitVisualConfig> = {
  tradeable: {
    material: { roughness: 0.4, metalness: 0.2 },
    emissive: { color: '#FFD700', intensity: 0.1 },
    tags: ['commerce'],
    layer: 'visual_effect',
  },
  giftable: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF88CC', intensity: 0.15 },
    tags: ['social', 'positive'],
    layer: 'visual_effect',
  },
  rentable: {
    material: { roughness: 0.5 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['commerce'],
    layer: 'visual_effect',
  },
  auctionable: {
    material: { roughness: 0.3, metalness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.2 },
    tags: ['commerce', 'valuable'],
    layer: 'visual_effect',
  },
  voteable: {
    material: { roughness: 0.4 },
    emissive: { color: '#66CC66', intensity: 0.1 },
    tags: ['social', 'interactive'],
    layer: 'visual_effect',
  },
  subscribable: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF4444', intensity: 0.1 },
    tags: ['social'],
    layer: 'visual_effect',
  },
  tippable: {
    material: { roughness: 0.4, metalness: 0.2 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['commerce'],
    layer: 'visual_effect',
  },
  reviewable: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC00', intensity: 0.1 },
    tags: ['social'],
    layer: 'visual_effect',
  },
  curated: {
    material: { roughness: 0.3, envMapIntensity: 1.2 },
    tags: ['premium', 'clean'],
    layer: 'visual_effect',
  },
  featured: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.25 },
    tags: ['highlight', 'premium'],
    layer: 'visual_effect',
  },
  limited_edition: {
    material: { roughness: 0.2, metalness: 0.4 },
    emissive: { color: '#FF6600', intensity: 0.2 },
    tags: ['rare', 'premium'],
    layer: 'visual_effect',
  },
  seasonal_item: {
    material: { roughness: 0.4 },
    emissive: { color: '#88DDAA', intensity: 0.15 },
    tags: ['special', 'temporal'],
    layer: 'visual_effect',
  },
};
