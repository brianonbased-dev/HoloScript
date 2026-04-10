import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for gems & minerals traits (30 traits).
 * Precious stones, metals, and fantasy materials.
 */
export const GEMS_MINERALS_VISUALS: Record<string, TraitVisualConfig> = {
  diamond_gem: {
    material: {
      roughness: 0.0,
      metalness: 0.0,
      transmission: 0.95,
      ior: 2.42,
      iridescence: 0.3,
      envMapIntensity: 2.0,
    },
    tags: ['gem', 'transparent', 'reflective'],
    layer: 'base_material',
  },
  ruby_gem: {
    material: { roughness: 0.05, metalness: 0.0, color: '#E0115F', transmission: 0.6, ior: 1.77 },
    tags: ['gem', 'translucent'],
    layer: 'base_material',
  },
  emerald_gem: {
    material: { roughness: 0.05, metalness: 0.0, color: '#50C878', transmission: 0.5, ior: 1.58 },
    tags: ['gem', 'translucent'],
    layer: 'base_material',
  },
  sapphire_gem: {
    material: { roughness: 0.05, metalness: 0.0, color: '#0F52BA', transmission: 0.6, ior: 1.77 },
    tags: ['gem', 'translucent'],
    layer: 'base_material',
  },
  amethyst: {
    material: { roughness: 0.1, metalness: 0.0, color: '#9966CC', transmission: 0.5, ior: 1.55 },
    tags: ['gem', 'translucent'],
    layer: 'base_material',
  },
  topaz: {
    material: { roughness: 0.05, metalness: 0.0, color: '#FFC87C', transmission: 0.7, ior: 1.63 },
    tags: ['gem', 'translucent'],
    layer: 'base_material',
  },
  opal: {
    material: {
      roughness: 0.1,
      metalness: 0.0,
      color: '#FFE4E1',
      iridescence: 1.0,
      iridescenceIOR: 1.45,
    },
    tags: ['gem', 'iridescent'],
    layer: 'base_material',
  },
  pearl: {
    material: {
      roughness: 0.15,
      metalness: 0.1,
      color: '#FFF5EE',
      iridescence: 0.6,
      envMapIntensity: 1.0,
    },
    tags: ['organic', 'iridescent'],
    layer: 'base_material',
  },
  obsidian: {
    material: { roughness: 0.05, metalness: 0.0, color: '#1B1B1B', envMapIntensity: 1.5 },
    tags: ['mineral', 'dark', 'reflective'],
    layer: 'base_material',
  },
  jade: {
    material: { roughness: 0.3, metalness: 0.0, color: '#00A86B', transmission: 0.2 },
    tags: ['mineral', 'translucent'],
    layer: 'base_material',
  },
  amber: {
    material: { roughness: 0.1, metalness: 0.0, color: '#FFBF00', transmission: 0.6, ior: 1.54 },
    tags: ['organic', 'translucent', 'warm'],
    layer: 'base_material',
  },
  quartz: {
    material: { roughness: 0.05, metalness: 0.0, color: '#FFFFFF', transmission: 0.85, ior: 1.54 },
    tags: ['mineral', 'transparent'],
    layer: 'base_material',
  },
  crystal_gem: {
    material: {
      roughness: 0.0,
      metalness: 0.1,
      transmission: 0.9,
      ior: 2.0,
      iridescence: 1.0,
      iridescenceIOR: 1.3,
    },
    tags: ['mineral', 'transparent', 'reflective'],
    layer: 'base_material',
  },
  gold_material: {
    material: { roughness: 0.3, metalness: 1.0, color: '#FFD700', envMapIntensity: 1.5 },
    tags: ['metallic', 'precious'],
    layer: 'base_material',
  },
  silver_material: {
    material: { roughness: 0.2, metalness: 1.0, color: '#C0C0C0', envMapIntensity: 1.5 },
    tags: ['metallic', 'precious'],
    layer: 'base_material',
  },
  bronze_material: {
    material: { roughness: 0.4, metalness: 0.9, color: '#CD7F32' },
    tags: ['metallic'],
    layer: 'base_material',
  },
  copper_material: {
    material: { roughness: 0.4, metalness: 1.0, color: '#B87333' },
    tags: ['metallic'],
    layer: 'base_material',
  },
  iron_material: {
    material: { roughness: 0.5, metalness: 0.9, color: '#434343' },
    tags: ['metallic'],
    layer: 'base_material',
  },
  steel_material: {
    material: { roughness: 0.2, metalness: 1.0, color: '#71797E', envMapIntensity: 1.3 },
    tags: ['metallic', 'reflective'],
    layer: 'base_material',
  },
  titanium_material: {
    material: { roughness: 0.15, metalness: 1.0, color: '#878681', envMapIntensity: 1.2 },
    tags: ['metallic', 'reflective'],
    layer: 'base_material',
  },
  mithril: {
    material: {
      roughness: 0.1,
      metalness: 1.0,
      color: '#C0D8E8',
      envMapIntensity: 1.8,
      emissive: '#E0F0FF',
      emissiveIntensity: 0.2,
    },
    tags: ['metallic', 'fantasy', 'magical'],
    layer: 'base_material',
  },
  adamantine: {
    material: { roughness: 0.05, metalness: 1.0, color: '#2F4F4F', envMapIntensity: 2.0 },
    tags: ['metallic', 'fantasy', 'indestructible'],
    layer: 'base_material',
  },
  orichalcum: {
    material: {
      roughness: 0.2,
      metalness: 1.0,
      color: '#E8A317',
      emissive: '#FF8C00',
      emissiveIntensity: 0.3,
      envMapIntensity: 1.5,
    },
    tags: ['metallic', 'fantasy', 'magical'],
    layer: 'base_material',
  },
  moonstone: {
    material: {
      roughness: 0.15,
      metalness: 0.0,
      color: '#E8E0F0',
      iridescence: 0.7,
      transmission: 0.3,
    },
    tags: ['gem', 'iridescent', 'magical'],
    layer: 'base_material',
  },
  sunstone: {
    material: {
      roughness: 0.2,
      metalness: 0.1,
      color: '#FF8C00',
      emissive: '#FF6600',
      emissiveIntensity: 0.5,
    },
    tags: ['gem', 'warm', 'magical'],
    layer: 'base_material',
  },
  bloodstone: {
    material: { roughness: 0.3, metalness: 0.0, color: '#3B3C36' },
    tags: ['gem', 'dark'],
    layer: 'base_material',
  },
  lapis_lazuli: {
    material: { roughness: 0.35, metalness: 0.05, color: '#26619C' },
    tags: ['gem', 'opaque'],
    layer: 'base_material',
  },
  turquoise_gem: {
    material: { roughness: 0.4, metalness: 0.0, color: '#40E0D0' },
    tags: ['gem', 'opaque'],
    layer: 'base_material',
  },
  onyx: {
    material: { roughness: 0.1, metalness: 0.0, color: '#0F0F0F', envMapIntensity: 1.2 },
    tags: ['gem', 'dark', 'polished'],
    layer: 'base_material',
  },
  garnet: {
    material: { roughness: 0.15, metalness: 0.0, color: '#7B3F3F', transmission: 0.3, ior: 1.73 },
    tags: ['gem', 'translucent'],
    layer: 'base_material',
  },
};
