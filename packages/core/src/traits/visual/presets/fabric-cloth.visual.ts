import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for fabric & cloth traits (30 traits).
 * Fabric objects and textile properties.
 */
export const FABRIC_CLOTH_VISUALS: Record<string, TraitVisualConfig> = {
  curtain: {
    material: { roughness: 0.85, metalness: 0.0, color: '#8B0000' },
    tags: ['fabric', 'hanging'],
    layer: 'base_material',
  },
  banner: {
    material: { roughness: 0.8, metalness: 0.0 },
    tags: ['fabric', 'hanging'],
    layer: 'base_material',
  },
  flag: {
    material: { roughness: 0.8, metalness: 0.0 },
    tags: ['fabric', 'waving'],
    layer: 'base_material',
  },
  tapestry: {
    material: { roughness: 0.9, metalness: 0.0, color: '#704214' },
    tags: ['fabric', 'ornate'],
    layer: 'base_material',
  },
  blanket: {
    material: { roughness: 0.95, metalness: 0.0 },
    tags: ['fabric', 'soft'],
    layer: 'base_material',
  },
  tent: {
    material: { roughness: 0.8, metalness: 0.0, color: '#8B7355' },
    tags: ['fabric', 'shelter'],
    layer: 'base_material',
  },
  canopy: {
    material: { roughness: 0.75, metalness: 0.0 },
    tags: ['fabric', 'overhead'],
    layer: 'base_material',
  },
  sail: {
    material: { roughness: 0.7, metalness: 0.0, color: '#F5F5DC' },
    tags: ['fabric', 'waving'],
    layer: 'base_material',
  },
  cloak: {
    material: { roughness: 0.85, metalness: 0.0, color: '#2F2F4F' },
    tags: ['fabric', 'dark'],
    layer: 'base_material',
  },
  ribbon: {
    material: { roughness: 0.3, metalness: 0.0 },
    tags: ['fabric', 'smooth'],
    layer: 'base_material',
  },
  carpet: {
    material: { roughness: 1.0, metalness: 0.0, color: '#993333' },
    tags: ['fabric', 'floor'],
    layer: 'base_material',
  },
  rug: {
    material: { roughness: 1.0, metalness: 0.0 },
    tags: ['fabric', 'floor'],
    layer: 'base_material',
  },
  drape: {
    material: { roughness: 0.8, metalness: 0.0 },
    tags: ['fabric', 'hanging'],
    layer: 'base_material',
  },
  awning: {
    material: { roughness: 0.75, metalness: 0.0, color: '#CC4444' },
    tags: ['fabric', 'shelter'],
    layer: 'base_material',
  },
  hammock: {
    material: { roughness: 0.85, metalness: 0.0, color: '#DEB887' },
    tags: ['fabric', 'woven'],
    layer: 'base_material',
  },
  net_fabric: {
    material: { roughness: 0.7, metalness: 0.0, transparent: true, opacity: 0.6 },
    tags: ['fabric', 'transparent'],
    layer: 'base_material',
  },
  parachute: {
    material: { roughness: 0.5, metalness: 0.0 },
    tags: ['fabric', 'lightweight'],
    layer: 'base_material',
  },
  tarp: {
    material: { roughness: 0.6, metalness: 0.0, color: '#556B2F' },
    tags: ['fabric', 'waterproof'],
    layer: 'base_material',
  },
  towel: {
    material: { roughness: 1.0, metalness: 0.0, color: '#F0F0F0' },
    tags: ['fabric', 'soft'],
    layer: 'base_material',
  },
  tablecloth: {
    material: { roughness: 0.8, metalness: 0.0, color: '#FFFFFF' },
    tags: ['fabric', 'flat'],
    layer: 'base_material',
  },
  bedsheet: {
    material: { roughness: 0.7, metalness: 0.0, color: '#F5F5F5' },
    tags: ['fabric', 'soft'],
    layer: 'base_material',
  },
  pillow: {
    material: { roughness: 0.9, metalness: 0.0, color: '#FFFAF0' },
    tags: ['fabric', 'soft'],
    layer: 'base_material',
  },
  cushion: {
    material: { roughness: 0.9, metalness: 0.0 },
    tags: ['fabric', 'soft'],
    layer: 'base_material',
  },
  upholstered: {
    material: { roughness: 0.85, metalness: 0.0 },
    tags: ['fabric', 'padded'],
    layer: 'surface',
  },
  quilted: {
    material: { roughness: 0.9, metalness: 0.0 },
    tags: ['fabric', 'textured'],
    layer: 'surface',
  },
  pleated: {
    material: { roughness: 0.6, metalness: 0.0 },
    tags: ['fabric', 'textured'],
    layer: 'surface',
  },
  ruffled: {
    material: { roughness: 0.7, metalness: 0.0 },
    tags: ['fabric', 'textured'],
    layer: 'surface',
  },
  tattered: {
    material: { roughness: 0.95, metalness: 0.0 },
    tags: ['fabric', 'damaged'],
    layer: 'condition',
  },
  flowing: {
    material: { roughness: 0.5, metalness: 0.0 },
    tags: ['fabric', 'animated'],
    layer: 'visual_effect',
  },
  billowing: {
    material: { roughness: 0.6, metalness: 0.0 },
    tags: ['fabric', 'animated'],
    layer: 'visual_effect',
  },
};
