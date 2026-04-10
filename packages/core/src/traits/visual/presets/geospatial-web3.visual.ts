import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for geospatial/web3 traits (10 traits).
 * Geospatial and web3/blockchain features.
 */
export const GEOSPATIAL_WEB3_VISUALS: Record<string, TraitVisualConfig> = {
  geospatial_anchor: {
    material: { roughness: 0.3 },
    emissive: { color: '#44CC88', intensity: 0.2 },
    tags: ['ar', 'location', 'fixed'],
    layer: 'visual_effect',
  },
  terrain_anchor: {
    material: { roughness: 0.6, color: '#6B8E23' },
    emissive: { color: '#44CC44', intensity: 0.1 },
    tags: ['ar', 'terrain'],
    layer: 'environmental',
  },
  rooftop_anchor: {
    material: { roughness: 0.5, color: '#888888' },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['ar', 'elevated'],
    layer: 'environmental',
  },
  vps: {
    material: { roughness: 0.3 },
    emissive: { color: '#88CCFF', intensity: 0.15 },
    tags: ['ar', 'positioning'],
    layer: 'visual_effect',
  },
  poi: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF8844', intensity: 0.25 },
    tags: ['marker', 'location'],
    layer: 'visual_effect',
  },
  nft: {
    material: { roughness: 0.2, metalness: 0.4 },
    emissive: { color: '#CC88FF', intensity: 0.2 },
    tags: ['web3', 'unique', 'valuable'],
    layer: 'visual_effect',
  },
  token_gated: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.2 },
    opacity: 0.8,
    tags: ['web3', 'locked'],
    layer: 'visual_effect',
  },
  wallet: {
    material: { roughness: 0.3, metalness: 0.3, color: '#333333' },
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['web3', 'finance'],
    layer: 'visual_effect',
  },
  marketplace: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['commerce', 'web3'],
    layer: 'visual_effect',
  },
  portable: {
    material: { roughness: 0.4 },
    tags: ['transferable', 'lightweight'],
    layer: 'physical',
  },
};
