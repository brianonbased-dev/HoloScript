import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for water & fluid traits (19 traits).
 * Liquid behaviors and water-related properties.
 */
export const WATER_FLUID_VISUALS: Record<string, TraitVisualConfig> = {
  submersible: {
    material: { color: '#006994', transparent: true, opacity: 0.8 },
    tags: ['underwater'],
    layer: 'environmental',
  },
  waterproof: {
    material: { roughness: 0.2, envMapIntensity: 0.8 },
    tags: ['sealed'],
    layer: 'surface',
  },
  sinkable: {
    tags: ['heavy'],
    layer: 'physical',
  },
  absorbent: {
    material: { roughness: 0.95 },
    tags: ['porous'],
    layer: 'surface',
  },
  drainable: {
    tags: ['container'],
    layer: 'physical',
  },
  permeable: {
    material: { transparent: true, opacity: 0.9 },
    tags: ['porous'],
    layer: 'surface',
  },
  watertight: {
    material: { roughness: 0.2 },
    tags: ['sealed'],
    layer: 'surface',
  },
  floatable: {
    tags: ['lightweight'],
    layer: 'physical',
  },
  hydrophobic: {
    material: { roughness: 0.1, envMapIntensity: 1.0 },
    tags: ['repellent'],
    layer: 'surface',
  },
  hydrophilic: {
    material: { roughness: 0.8 },
    tags: ['absorbent'],
    layer: 'surface',
  },
  pressurized: {
    emissive: { color: '#FF4444', intensity: 0.3 },
    tags: ['danger'],
    layer: 'physical',
  },
  leaking: {
    particleEffect: 'drip',
    tags: ['damaged', 'wet'],
    layer: 'visual_effect',
  },
  overflowing: {
    particleEffect: 'waterfall',
    material: { color: '#4488CC', transparent: true, opacity: 0.7 },
    tags: ['wet', 'animated'],
    layer: 'visual_effect',
  },
  evaporating: {
    particleEffect: 'steam',
    material: { transparent: true, opacity: 0.6 },
    tags: ['hot', 'transparent'],
    layer: 'visual_effect',
  },
  condensing: {
    material: { roughness: 0.1, envMapIntensity: 1.2 },
    tags: ['wet', 'cold'],
    layer: 'surface',
  },
  frozen_liquid: {
    material: { roughness: 0.1, color: '#D6EAF8', transmission: 0.7, ior: 1.31, transparent: true },
    tags: ['cold', 'transparent'],
    layer: 'base_material',
  },
  boiling: {
    particleEffect: 'bubbles',
    emissive: { color: '#FF6600', intensity: 0.5 },
    tags: ['hot', 'animated'],
    layer: 'visual_effect',
  },
  viscous: {
    material: { roughness: 0.3, envMapIntensity: 0.8, color: '#554433' },
    tags: ['thick', 'slow'],
    layer: 'surface',
  },
  corrosive: {
    emissive: { color: '#00FF00', intensity: 0.8 },
    material: { emissive: '#00FF00', emissiveIntensity: 0.8, color: '#44AA00' },
    tags: ['danger', 'chemical'],
    layer: 'visual_effect',
  },
};
