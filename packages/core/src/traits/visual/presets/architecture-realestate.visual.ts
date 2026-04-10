import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for architecture and real estate traits (42 traits).
 * Architecture, rooms, and building features.
 */
export const ARCHITECTURE_REALESTATE_VISUALS: Record<string, TraitVisualConfig> = {
  floor_plan: {
    material: { roughness: 0.3, color: '#F0F0FF' },
    tags: ['display', 'technical'],
    layer: 'visual_effect',
  },
  room_layout: {
    material: { roughness: 0.5 },
    tags: ['structure', 'spatial'],
    layer: 'environmental',
  },
  furniture_placement: {
    material: { roughness: 0.5 },
    tags: ['interactive', 'spatial'],
    layer: 'environmental',
  },
  interior_design: {
    material: { roughness: 0.4 },
    tags: ['aesthetic', 'spatial'],
    layer: 'environmental',
  },
  exterior_design: {
    material: { roughness: 0.5 },
    tags: ['aesthetic', 'outdoor'],
    layer: 'environmental',
  },
  landscape: {
    material: { roughness: 0.7, color: '#4A8C5E' },
    tags: ['nature', 'outdoor'],
    layer: 'environmental',
  },
  garden: {
    material: { roughness: 0.7, color: '#2E8B57' },
    tags: ['nature', 'organic'],
    layer: 'environmental',
  },
  pool: {
    material: { roughness: 0.1, color: '#4488CC', transmission: 0.6, ior: 1.33 },
    tags: ['water', 'reflective'],
    layer: 'environmental',
  },
  driveway: {
    material: { roughness: 0.7, color: '#555555' },
    tags: ['concrete', 'outdoor'],
    layer: 'environmental',
  },
  garage: {
    material: { roughness: 0.5, color: '#888888' },
    tags: ['structure', 'concrete'],
    layer: 'environmental',
  },
  balcony: {
    material: { roughness: 0.5, metalness: 0.3 },
    tags: ['structure', 'outdoor'],
    layer: 'environmental',
  },
  terrace: {
    material: { roughness: 0.6, color: '#C4A882' },
    tags: ['stone', 'outdoor'],
    layer: 'environmental',
  },
  courtyard: {
    material: { roughness: 0.6, color: '#C4B99A' },
    tags: ['stone', 'outdoor'],
    layer: 'environmental',
  },
  atrium: {
    material: { roughness: 0.3, envMapIntensity: 1.2 },
    tags: ['glass', 'open'],
    layer: 'environmental',
  },
  lobby: {
    material: { roughness: 0.3, color: '#D4C5A0', envMapIntensity: 1.1 },
    tags: ['polished', 'interior'],
    layer: 'environmental',
  },
  hallway: {
    material: { roughness: 0.4, color: '#E8E0D0' },
    tags: ['interior', 'passage'],
    layer: 'environmental',
  },
  basement: {
    material: { roughness: 0.7, color: '#555555' },
    tags: ['concrete', 'underground', 'dark'],
    layer: 'environmental',
  },
  attic: {
    material: { roughness: 0.7, color: '#8B7355' },
    tags: ['wooden', 'dusty'],
    layer: 'environmental',
  },
  closet: {
    material: { roughness: 0.5, color: '#E8DCC8' },
    tags: ['interior', 'small'],
    layer: 'environmental',
  },
  pantry: {
    material: { roughness: 0.5, color: '#E8DCC8' },
    tags: ['interior', 'storage'],
    layer: 'environmental',
  },
  laundry: {
    material: { roughness: 0.4, color: '#E8E8E8' },
    tags: ['interior', 'utility'],
    layer: 'environmental',
  },
  utility_room: {
    material: { roughness: 0.5, color: '#CCCCCC' },
    tags: ['interior', 'utility'],
    layer: 'environmental',
  },
  home_office: {
    material: { roughness: 0.4, color: '#E8DCC8' },
    tags: ['interior', 'workspace'],
    layer: 'environmental',
  },
  gym_room: {
    material: { roughness: 0.4, color: '#555555' },
    tags: ['interior', 'active'],
    layer: 'environmental',
  },
  theater_room: {
    material: { roughness: 0.6, color: '#1A1A2E' },
    tags: ['interior', 'dark', 'entertainment'],
    layer: 'environmental',
  },
  wine_cellar: {
    material: { roughness: 0.7, color: '#4A3728' },
    tags: ['interior', 'underground', 'wooden'],
    layer: 'environmental',
  },
  rooftop_deck: {
    material: { roughness: 0.5, color: '#8B7355' },
    tags: ['outdoor', 'elevated'],
    layer: 'environmental',
  },
  smart_home: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.15 },
    tags: ['electronic', 'connected'],
    layer: 'visual_effect',
  },
  hvac: {
    material: { roughness: 0.4, metalness: 0.6, color: '#888888' },
    tags: ['metallic', 'utility'],
    layer: 'base_material',
  },
  plumbing: {
    material: { roughness: 0.3, metalness: 0.7, color: '#B87333' },
    tags: ['metallic', 'utility', 'copper'],
    layer: 'base_material',
  },
  electrical: {
    material: { roughness: 0.4, color: '#444444' },
    emissive: { color: '#FFCC00', intensity: 0.15 },
    tags: ['utility', 'power'],
    layer: 'visual_effect',
  },
  solar_panel: {
    material: { roughness: 0.2, metalness: 0.3, color: '#1A2744', envMapIntensity: 1.2 },
    tags: ['electronic', 'reflective', 'outdoor'],
    layer: 'base_material',
  },
  security_camera: {
    material: { roughness: 0.3, metalness: 0.4, color: '#333333' },
    emissive: { color: '#FF0000', intensity: 0.15 },
    tags: ['electronic', 'security'],
    layer: 'base_material',
  },
  smart_lock: {
    material: { roughness: 0.3, metalness: 0.5, color: '#333333' },
    emissive: { color: '#44FF88', intensity: 0.1 },
    tags: ['electronic', 'security', 'metallic'],
    layer: 'base_material',
  },
  doorbell: {
    material: { roughness: 0.3, metalness: 0.4, color: '#444444' },
    emissive: { color: '#FFFFFF', intensity: 0.1 },
    tags: ['electronic', 'interactive'],
    layer: 'base_material',
  },
  thermostat: {
    material: { roughness: 0.3, color: '#E8E8E8' },
    emissive: { color: '#44AAFF', intensity: 0.15 },
    tags: ['electronic', 'display'],
    layer: 'visual_effect',
  },
  sprinkler: {
    material: { roughness: 0.4, metalness: 0.5, color: '#888888' },
    tags: ['metallic', 'water'],
    layer: 'base_material',
  },
};
