import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for age & condition traits (30 traits).
 * Wear, decay, and preservation states.
 */
export const AGE_CONDITION_VISUALS: Record<string, TraitVisualConfig> = {
  pristine: {
    material: { roughness: 0.1, envMapIntensity: 1.2 },
    tags: ['clean', 'new'],
    layer: 'condition',
  },
  worn: {
    material: { roughness: 0.75 },
    tags: ['aged', 'used'],
    layer: 'condition',
  },
  rusted: {
    material: { roughness: 0.85, metalness: 0.6, color: '#8B4513' },
    tags: ['metallic', 'corroded', 'aged'],
    layer: 'condition',
  },
  weathered: {
    material: { roughness: 0.8 },
    tags: ['aged', 'outdoor'],
    layer: 'condition',
  },
  decayed: {
    material: { roughness: 0.95, color: '#4A3728' },
    tags: ['aged', 'organic'],
    layer: 'condition',
  },
  fossilized: {
    material: { roughness: 0.7, metalness: 0.0, color: '#8B8378' },
    tags: ['mineral', 'ancient'],
    layer: 'condition',
  },
  tarnished: {
    material: { roughness: 0.5, metalness: 0.7, color: '#7B7B5E' },
    tags: ['metallic', 'aged'],
    layer: 'condition',
  },
  polished: {
    material: { roughness: 0.05, envMapIntensity: 1.5 },
    tags: ['clean', 'reflective'],
    layer: 'condition',
  },
  crumbling: {
    material: { roughness: 1.0 },
    tags: ['damaged', 'fragile'],
    layer: 'condition',
  },
  corroded: {
    material: { roughness: 0.9, metalness: 0.4, color: '#5C6B4E' },
    tags: ['metallic', 'chemical', 'aged'],
    layer: 'condition',
  },
  faded: {
    material: { roughness: 0.7 },
    opacity: 0.85,
    tags: ['aged', 'washed-out'],
    layer: 'condition',
  },
  stained: {
    material: { roughness: 0.7 },
    tags: ['dirty', 'discolored'],
    layer: 'condition',
  },
  scratched: {
    material: { roughness: 0.6 },
    tags: ['damaged', 'surface'],
    layer: 'condition',
  },
  dented: {
    material: { roughness: 0.5 },
    tags: ['damaged', 'metallic'],
    layer: 'condition',
  },
  chipped: {
    material: { roughness: 0.6 },
    tags: ['damaged'],
    layer: 'condition',
  },
  cracked: {
    material: { roughness: 0.7 },
    tags: ['damaged', 'structural'],
    layer: 'condition',
  },
  shattered: {
    material: { roughness: 0.8 },
    tags: ['damaged', 'broken'],
    layer: 'condition',
  },
  patched: {
    material: { roughness: 0.7 },
    tags: ['repaired'],
    layer: 'condition',
  },
  restored: {
    material: { roughness: 0.2, envMapIntensity: 1.0 },
    tags: ['clean', 'repaired'],
    layer: 'condition',
  },
  antique: {
    material: { roughness: 0.6, color: '#B8860B' },
    tags: ['aged', 'valuable'],
    layer: 'condition',
  },
  brand_new: {
    material: { roughness: 0.1, envMapIntensity: 1.3 },
    tags: ['clean', 'new'],
    layer: 'condition',
  },
  battle_scarred: {
    material: { roughness: 0.7 },
    tags: ['damaged', 'combat'],
    layer: 'condition',
  },
  moss_covered: {
    material: { roughness: 0.9, color: '#4A7C3F' },
    tags: ['organic', 'overgrown'],
    layer: 'condition',
  },
  vine_covered: {
    material: { roughness: 0.85, color: '#2E8B57' },
    tags: ['organic', 'overgrown'],
    layer: 'condition',
  },
  dust_covered: {
    material: { roughness: 0.9, color: '#C4B99A' },
    tags: ['dirty', 'aged'],
    layer: 'condition',
  },
  blood_stained: {
    material: { roughness: 0.7, color: '#8B0000' },
    tags: ['dark', 'stained'],
    layer: 'condition',
  },
  sun_bleached: {
    material: { roughness: 0.8 },
    tags: ['faded', 'outdoor'],
    layer: 'condition',
  },
  charred: {
    material: { roughness: 0.95, metalness: 0.0, color: '#1A1110' },
    tags: ['burned', 'dark'],
    layer: 'condition',
  },
  petrified: {
    material: { roughness: 0.6, metalness: 0.0, color: '#808069' },
    tags: ['mineral', 'ancient'],
    layer: 'condition',
  },
  calcified: {
    material: { roughness: 0.7, metalness: 0.0, color: '#E8DCC8' },
    tags: ['mineral', 'encrusted'],
    layer: 'condition',
  },
};
