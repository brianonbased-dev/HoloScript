import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for transportation and vehicle traits (12 traits).
 * Vehicle components and transport features.
 */
export const TRANSPORTATION_VEHICLES_VISUALS: Record<string, TraitVisualConfig> = {
  dockable: {
    material: { roughness: 0.4, metalness: 0.5 },
    tags: ['connector', 'metallic'],
    layer: 'physical',
  },
  launchable: {
    material: { roughness: 0.3, metalness: 0.6, color: '#E8E8E8' },
    emissive: { color: '#FF4400', intensity: 0.15 },
    tags: ['aerospace', 'metallic'],
    layer: 'base_material',
  },
  landable: {
    material: { roughness: 0.4, metalness: 0.5, color: '#555555' },
    tags: ['aerospace', 'metallic'],
    layer: 'base_material',
  },
  towable: {
    material: { roughness: 0.5, metalness: 0.4, color: '#666666' },
    tags: ['heavy', 'metallic'],
    layer: 'physical',
  },
  attachable: {
    material: { roughness: 0.4, metalness: 0.5 },
    tags: ['connector', 'mechanical'],
    layer: 'physical',
  },
  detachable: {
    material: { roughness: 0.4, metalness: 0.5 },
    tags: ['connector', 'mechanical'],
    layer: 'physical',
  },
  fuelable: {
    material: { roughness: 0.4, metalness: 0.4 },
    tags: ['tank', 'liquid'],
    layer: 'physical',
  },
  autopilot: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.2 },
    tags: ['ai', 'electronic'],
    layer: 'visual_effect',
  },
  turret: {
    material: { roughness: 0.4, metalness: 0.8, color: '#4A4A4A' },
    tags: ['weapon', 'metallic', 'rotatable'],
    layer: 'base_material',
  },
  cockpit: {
    material: { roughness: 0.2, transmission: 0.5, ior: 1.5 },
    tags: ['glass', 'enclosed'],
    layer: 'base_material',
  },
  passenger_seat: {
    material: { roughness: 0.6, color: '#333333' },
    tags: ['seating', 'interior'],
    layer: 'base_material',
  },
  cargo_hold: {
    material: { roughness: 0.5, metalness: 0.4, color: '#555555' },
    tags: ['storage', 'metallic', 'large'],
    layer: 'base_material',
  },
};
