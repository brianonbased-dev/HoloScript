import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for construction & building traits (25 traits).
 */
export const CONSTRUCTION_BUILDING_VISUALS: Record<string, TraitVisualConfig> = {
  buildable: { tags: ['constructable'], layer: 'physical' },
  placeable: { tags: ['constructable'], layer: 'physical' },
  alignable: { tags: ['constructable'], layer: 'physical' },
  resizable: { tags: ['scalable'], layer: 'scale' },
  paintable_surface: { tags: ['customizable'], layer: 'surface' },
  terrain_modifiable: { tags: ['landscape'], layer: 'environmental' },
  blueprint: {
    material: { transparent: true, opacity: 0.4, emissive: '#4488FF', emissiveIntensity: 0.5 },
    tags: ['schematic', 'transparent'],
    layer: 'visual_effect',
  },
  foundation: {
    material: { roughness: 0.9, color: '#808080' },
    tags: ['concrete', 'structural'],
    layer: 'base_material',
  },
  wall: {
    material: { roughness: 0.8, color: '#D4D4D4' },
    tags: ['structural', 'flat'],
    layer: 'base_material',
  },
  roof: {
    material: { roughness: 0.7, color: '#8B4513' },
    tags: ['structural', 'angled'],
    layer: 'base_material',
  },
  door: {
    material: { roughness: 0.6, color: '#6B4423' },
    tags: ['wooden', 'interactable'],
    layer: 'base_material',
  },
  window: {
    material: { roughness: 0.0, transmission: 0.9, ior: 1.5, transparent: true },
    tags: ['glass', 'transparent'],
    layer: 'base_material',
  },
  staircase: {
    material: { roughness: 0.7, color: '#808080' },
    tags: ['structural'],
    layer: 'base_material',
  },
  ladder: {
    material: { roughness: 0.7, metalness: 0.5, color: '#888888' },
    tags: ['metallic', 'climbable'],
    layer: 'base_material',
  },
  bridge: {
    material: { roughness: 0.6, color: '#808080', metalness: 0.2 },
    tags: ['structural', 'spanning'],
    layer: 'base_material',
  },
  elevator: {
    material: { roughness: 0.3, metalness: 0.7, color: '#C0C0C0' },
    tags: ['metallic', 'mechanical'],
    layer: 'base_material',
  },
  conveyor: {
    material: { roughness: 0.7, metalness: 0.4, color: '#4A4A4A' },
    tags: ['metallic', 'mechanical'],
    layer: 'base_material',
  },
  pipe: {
    material: { roughness: 0.3, metalness: 0.8, color: '#888888' },
    tags: ['metallic', 'cylindrical'],
    layer: 'base_material',
  },
  wire: {
    material: { roughness: 0.2, metalness: 0.9, color: '#B87333' },
    tags: ['metallic', 'thin'],
    layer: 'base_material',
  },
  switch: {
    material: { roughness: 0.4, metalness: 0.5, color: '#F5F5F5' },
    tags: ['mechanical', 'interactable'],
    layer: 'base_material',
  },
  lever: {
    material: { roughness: 0.5, metalness: 0.6, color: '#808080' },
    tags: ['metallic', 'mechanical'],
    layer: 'base_material',
  },
  button: {
    material: { roughness: 0.3, color: '#FF0000' },
    tags: ['interactable'],
    layer: 'base_material',
  },
  pressure_plate: {
    material: { roughness: 0.4, metalness: 0.5, color: '#A0A0A0' },
    tags: ['metallic', 'hidden'],
    layer: 'base_material',
  },
  tripwire: {
    material: { transparent: true, opacity: 0.3, roughness: 0.2 },
    tags: ['thin', 'hidden'],
    layer: 'base_material',
  },
  alarm: {
    emissive: { color: '#FF0000', intensity: 1.5 },
    material: { emissive: '#FF0000', emissiveIntensity: 1.5 },
    tags: ['warning', 'emissive'],
    layer: 'visual_effect',
  },
};
