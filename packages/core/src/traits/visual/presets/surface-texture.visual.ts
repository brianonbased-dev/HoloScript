import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for surface-texture traits (30 traits).
 * Surface overlays that modify roughness, metalness, and appearance.
 */
export const SURFACE_TEXTURE_VISUALS: Record<string, TraitVisualConfig> = {
  furry: {
    material: { roughness: 1.0, metalness: 0.0 },
    tags: ['organic', 'soft'],
    layer: 'surface',
  },
  feathered: {
    material: { roughness: 0.8, metalness: 0.0 },
    tags: ['organic', 'soft'],
    layer: 'surface',
  },
  scaled: {
    material: { roughness: 0.4, metalness: 0.15, envMapIntensity: 0.8 },
    tags: ['organic', 'reptilian'],
    layer: 'surface',
  },
  leathery: {
    material: { roughness: 0.7, metalness: 0.0, color: '#5C3A21' },
    tags: ['organic', 'tough'],
    layer: 'surface',
  },
  silky: {
    material: { roughness: 0.15, metalness: 0.0, envMapIntensity: 0.6 },
    tags: ['fabric', 'smooth'],
    layer: 'surface',
  },
  velvety: {
    material: { roughness: 0.95, metalness: 0.0 },
    tags: ['fabric', 'soft'],
    layer: 'surface',
  },
  woolly: {
    material: { roughness: 1.0, metalness: 0.0 },
    tags: ['fabric', 'soft'],
    layer: 'surface',
  },
  rubber: {
    material: { roughness: 0.9, metalness: 0.0 },
    tags: ['synthetic', 'flexible'],
    layer: 'surface',
  },
  ceramic: {
    material: { roughness: 0.25, metalness: 0.0, envMapIntensity: 0.7 },
    tags: ['mineral', 'polished'],
    layer: 'surface',
  },
  porcelain: {
    material: { roughness: 0.1, metalness: 0.0, color: '#FEFEFE', envMapIntensity: 0.9 },
    tags: ['mineral', 'polished'],
    layer: 'surface',
  },
  woven: {
    material: { roughness: 0.85, metalness: 0.0 },
    tags: ['fabric', 'textured'],
    layer: 'surface',
  },
  knitted: {
    material: { roughness: 0.9, metalness: 0.0 },
    tags: ['fabric', 'soft'],
    layer: 'surface',
  },
  braided: {
    material: { roughness: 0.7, metalness: 0.0 },
    tags: ['fabric', 'textured'],
    layer: 'surface',
  },
  embossed: {
    material: { roughness: 0.6, metalness: 0.0 },
    tags: ['textured', 'raised'],
    layer: 'surface',
  },
  engraved: {
    material: { roughness: 0.5, metalness: 0.1 },
    tags: ['textured', 'detailed'],
    layer: 'surface',
  },
  etched: {
    material: { roughness: 0.45, metalness: 0.05 },
    tags: ['textured', 'detailed'],
    layer: 'surface',
  },
  brushed: {
    material: { roughness: 0.35, metalness: 0.6 },
    tags: ['metallic', 'textured'],
    layer: 'surface',
  },
  hammered: {
    material: { roughness: 0.55, metalness: 0.7 },
    tags: ['metallic', 'textured'],
    layer: 'surface',
  },
  pitted: {
    material: { roughness: 0.8, metalness: 0.0 },
    tags: ['damaged', 'textured'],
    layer: 'surface',
  },
  granular: {
    material: { roughness: 0.9, metalness: 0.0 },
    tags: ['rough', 'textured'],
    layer: 'surface',
  },
  sandy: {
    material: { roughness: 0.95, metalness: 0.0, color: '#C2B280' },
    tags: ['natural', 'rough'],
    layer: 'surface',
  },
  gravelly: {
    material: { roughness: 1.0, metalness: 0.0, color: '#8C8C8C' },
    tags: ['natural', 'rough'],
    layer: 'surface',
  },
  mossy: {
    material: { roughness: 0.9, metalness: 0.0, color: '#4A7C3F' },
    tags: ['organic', 'natural'],
    layer: 'surface',
  },
  slimy: {
    material: { roughness: 0.05, metalness: 0.0, envMapIntensity: 1.2, color: '#7CCD7C' },
    tags: ['organic', 'wet'],
    layer: 'surface',
  },
  crystallized: {
    material: { roughness: 0.1, metalness: 0.2, envMapIntensity: 1.5, iridescence: 0.5 },
    tags: ['mineral', 'reflective'],
    layer: 'surface',
  },
  frosted_surface: {
    material: { roughness: 0.3, metalness: 0.0, color: '#E8F4FD', transmission: 0.3 },
    tags: ['cold', 'translucent'],
    layer: 'surface',
  },
  glossy: {
    material: { roughness: 0.05, metalness: 0.3, envMapIntensity: 1.2 },
    tags: ['reflective', 'smooth'],
    layer: 'surface',
  },
  matte_surface: {
    material: { roughness: 0.95, metalness: 0.0 },
    tags: ['flat', 'non-reflective'],
    layer: 'surface',
  },
  satin: {
    material: { roughness: 0.25, metalness: 0.0, envMapIntensity: 0.5 },
    tags: ['fabric', 'smooth'],
    layer: 'surface',
  },
  pearlescent: {
    material: { roughness: 0.1, metalness: 0.15, iridescence: 0.8, iridescenceIOR: 1.3 },
    tags: ['iridescent', 'reflective'],
    layer: 'surface',
  },
};
