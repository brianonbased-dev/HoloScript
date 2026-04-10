import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for measurement & sensing traits (10 traits).
 * Measurement instruments, sensors, and signal devices.
 */
export const MEASUREMENT_SENSING_VISUALS: Record<string, TraitVisualConfig> = {
  measurable: {
    material: { roughness: 0.4 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['interactive', 'data'],
    layer: 'visual_effect',
  },
  weighable: { material: { roughness: 0.4 }, tags: ['interactive', 'physical'], layer: 'physical' },
  thermometer: {
    material: { roughness: 0.2, metalness: 0.5, color: '#C0C0C0' },
    emissive: { color: '#FF4400', intensity: 0.15 },
    tags: ['instrument', 'metallic'],
    layer: 'base_material',
  },
  compass: {
    material: { roughness: 0.3, metalness: 0.6, color: '#B87333' },
    tags: ['instrument', 'metallic'],
    layer: 'base_material',
  },
  radar: {
    material: { roughness: 0.3, metalness: 0.4 },
    emissive: { color: '#00FF00', intensity: 0.25 },
    tags: ['electronic', 'scanning'],
    layer: 'visual_effect',
  },
  sonar: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.2 },
    tags: ['electronic', 'scanning'],
    layer: 'visual_effect',
  },
  scanner: {
    material: { roughness: 0.3, metalness: 0.4 },
    emissive: { color: '#FF4444', intensity: 0.2 },
    tags: ['electronic', 'scanning'],
    layer: 'visual_effect',
  },
  detector: {
    material: { roughness: 0.4, metalness: 0.3 },
    emissive: { color: '#FFCC00', intensity: 0.15 },
    tags: ['electronic', 'alert'],
    layer: 'visual_effect',
  },
  beacon: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF8800', intensity: 0.4 },
    tags: ['signal', 'glowing'],
    layer: 'lighting',
  },
  signal: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FF44', intensity: 0.2 },
    tags: ['electronic', 'communication'],
    layer: 'visual_effect',
  },
};
