import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for maritime & naval traits (30 traits).
 */
export const MARITIME_NAVAL_VISUALS: Record<string, TraitVisualConfig> = {
  ship: {
    material: { roughness: 0.6, color: '#5C3A21' },
    tags: ['wooden', 'large'],
    layer: 'base_material',
  },
  boat: {
    material: { roughness: 0.7, color: '#6B4423' },
    tags: ['wooden', 'medium'],
    layer: 'base_material',
  },
  submarine: {
    material: { roughness: 0.3, metalness: 0.8, color: '#4A4A4A' },
    tags: ['metallic', 'underwater'],
    layer: 'base_material',
  },
  anchor_ship: {
    material: { roughness: 0.4, metalness: 0.9, color: '#3C3C3C' },
    tags: ['metallic', 'heavy'],
    layer: 'base_material',
  },
  lighthouse: {
    material: { roughness: 0.6, color: '#F5F5F5' },
    emissive: { color: '#FFFF00', intensity: 2.0 },
    tags: ['stone', 'beacon'],
    layer: 'base_material',
  },
  dock_structure: {
    material: { roughness: 0.8, color: '#8B7355' },
    tags: ['wooden', 'structural'],
    layer: 'base_material',
  },
  harbor: {
    material: { roughness: 0.7, color: '#808080' },
    tags: ['stone', 'large'],
    layer: 'base_material',
  },
  pier: {
    material: { roughness: 0.8, color: '#8B6914' },
    tags: ['wooden', 'flat'],
    layer: 'base_material',
  },
  buoy: {
    material: { roughness: 0.5, color: '#FF0000' },
    tags: ['floating', 'painted'],
    layer: 'base_material',
  },
  raft: {
    material: { roughness: 0.9, color: '#C4A35A' },
    tags: ['wooden', 'simple'],
    layer: 'base_material',
  },
  canoe: {
    material: { roughness: 0.6, color: '#8B4513' },
    tags: ['wooden', 'slim'],
    layer: 'base_material',
  },
  kayak: {
    material: { roughness: 0.4, color: '#FF6600' },
    tags: ['plastic', 'colorful'],
    layer: 'base_material',
  },
  yacht: {
    material: { roughness: 0.2, color: '#FFFFFF', envMapIntensity: 1.0 },
    tags: ['luxury', 'glossy'],
    layer: 'base_material',
  },
  cargo_ship: {
    material: { roughness: 0.5, metalness: 0.6, color: '#8B0000' },
    tags: ['metallic', 'large'],
    layer: 'base_material',
  },
  warship: {
    material: { roughness: 0.4, metalness: 0.7, color: '#696969' },
    tags: ['metallic', 'armored'],
    layer: 'base_material',
  },
  fishing_boat: {
    material: { roughness: 0.7, color: '#4682B4' },
    tags: ['wooden', 'small'],
    layer: 'base_material',
  },
  rowboat: {
    material: { roughness: 0.7, color: '#6B4423' },
    tags: ['wooden', 'small'],
    layer: 'base_material',
  },
  hovercraft: {
    material: { roughness: 0.3, metalness: 0.5, color: '#C0C0C0' },
    tags: ['metallic', 'vehicle'],
    layer: 'base_material',
  },
  lifeboat: {
    material: { roughness: 0.5, color: '#FF6600' },
    tags: ['painted', 'safety'],
    layer: 'base_material',
  },
  ferry: {
    material: { roughness: 0.5, metalness: 0.4, color: '#FFFFFF' },
    tags: ['metallic', 'large'],
    layer: 'base_material',
  },
  mast: {
    material: { roughness: 0.7, color: '#8B6914' },
    tags: ['wooden', 'tall'],
    layer: 'base_material',
  },
  rudder: {
    material: { roughness: 0.6, color: '#5C3A21' },
    tags: ['wooden', 'mechanical'],
    layer: 'base_material',
  },
  helm: {
    material: { roughness: 0.5, color: '#8B4513', metalness: 0.2 },
    tags: ['wooden', 'ornate'],
    layer: 'base_material',
  },
  porthole: {
    material: { roughness: 0.2, metalness: 0.6, transmission: 0.8, ior: 1.5 },
    tags: ['metallic', 'glass'],
    layer: 'base_material',
  },
  gangplank: {
    material: { roughness: 0.8, color: '#8B7355' },
    tags: ['wooden', 'flat'],
    layer: 'base_material',
  },
  crow_nest: {
    material: { roughness: 0.7, color: '#6B4423' },
    tags: ['wooden', 'elevated'],
    layer: 'base_material',
  },
  figurehead: {
    material: { roughness: 0.5, color: '#DAA520', metalness: 0.2 },
    tags: ['ornate', 'carved'],
    layer: 'base_material',
  },
  hull: {
    material: { roughness: 0.5, color: '#5C3A21' },
    tags: ['wooden', 'structural'],
    layer: 'base_material',
  },
  keel: {
    material: { roughness: 0.6, color: '#4A4A4A', metalness: 0.3 },
    tags: ['structural'],
    layer: 'base_material',
  },
  propeller: {
    material: { roughness: 0.2, metalness: 0.9, color: '#B87333' },
    tags: ['metallic', 'spinning'],
    layer: 'base_material',
  },
};
