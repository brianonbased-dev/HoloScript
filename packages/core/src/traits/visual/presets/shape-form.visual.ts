import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for shape & form traits (32 traits).
 * These primarily affect geometry hints rather than materials.
 */
export const SHAPE_FORM_VISUALS: Record<string, TraitVisualConfig> = {
  round: { tags: ['curved', 'smooth'], layer: 'physical' },
  square: { tags: ['angular', 'geometric'], layer: 'physical' },
  triangular: { tags: ['angular', 'geometric'], layer: 'physical' },
  hexagonal: { tags: ['geometric', 'tessellated'], layer: 'physical' },
  octagonal: { tags: ['geometric'], layer: 'physical' },
  spiral: { tags: ['curved', 'complex'], layer: 'physical' },
  twisted: { tags: ['curved', 'deformed'], layer: 'physical' },
  hollow: {
    material: { transparent: true, opacity: 0.9 },
    tags: ['empty', 'open'],
    layer: 'physical',
  },
  solid: { tags: ['dense', 'opaque'], layer: 'physical' },
  perforated: {
    material: { transparent: true, opacity: 0.85 },
    tags: ['holes', 'open'],
    layer: 'physical',
  },
  lattice: {
    material: { transparent: true, opacity: 0.7 },
    tags: ['open', 'structural'],
    layer: 'physical',
  },
  branching: { tags: ['organic', 'tree-like'], layer: 'physical' },
  tapered: { tags: ['narrowing'], layer: 'physical' },
  flared: { tags: ['widening'], layer: 'physical' },
  curved: { tags: ['smooth', 'organic'], layer: 'physical' },
  angular: { tags: ['sharp', 'geometric'], layer: 'physical' },
  symmetrical: { tags: ['balanced'], layer: 'physical' },
  asymmetrical: { tags: ['irregular'], layer: 'physical' },
  organic_form: { material: { roughness: 0.7 }, tags: ['natural', 'curved'], layer: 'physical' },
  geometric: { material: { roughness: 0.3 }, tags: ['precise', 'angular'], layer: 'physical' },
  fractal_shape: {
    material: { iridescence: 0.3 },
    tags: ['complex', 'recursive'],
    layer: 'physical',
  },
  amorphous: { material: { roughness: 0.6 }, tags: ['blobby', 'organic'], layer: 'physical' },
  segmented: { tags: ['divided', 'modular'], layer: 'physical' },
  layered_form: { tags: ['stacked', 'composite'], layer: 'physical' },
  nested: { tags: ['recursive', 'contained'], layer: 'physical' },
  interlocking: { tags: ['connected', 'mechanical'], layer: 'physical' },
  modular_shape: { tags: ['repeating', 'constructable'], layer: 'physical' },
  tessellated: { tags: ['tiled', 'repeating'], layer: 'physical' },
  ribbed: { material: { roughness: 0.6 }, tags: ['textured', 'structural'], layer: 'surface' },
  corrugated: { material: { roughness: 0.7 }, tags: ['textured', 'wavy'], layer: 'surface' },
  faceted: {
    material: { roughness: 0.15, envMapIntensity: 1.3 },
    tags: ['geometric', 'reflective'],
    layer: 'surface',
  },
  smooth_form: { material: { roughness: 0.1 }, tags: ['smooth', 'polished'], layer: 'surface' },
};
