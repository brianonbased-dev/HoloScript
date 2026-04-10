import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for procedural generation traits (25 traits).
 * Procedural content generation systems.
 */
export const PROCEDURAL_GENERATION_VISUALS: Record<string, TraitVisualConfig> = {
  procedural_terrain: {
    material: { roughness: 0.7, color: '#6B8E23' },
    tags: ['terrain', 'generated'],
    layer: 'environmental',
  },
  procedural_city: {
    material: { roughness: 0.5, color: '#888888' },
    tags: ['urban', 'generated'],
    layer: 'environmental',
  },
  procedural_dungeon: {
    material: { roughness: 0.8, color: '#4A3728' },
    tags: ['dark', 'generated'],
    layer: 'environmental',
  },
  procedural_biome: {
    material: { roughness: 0.6 },
    tags: ['nature', 'generated'],
    layer: 'environmental',
  },
  procedural_npc: {
    material: { roughness: 0.5 },
    emissive: { color: '#88AAFF', intensity: 0.1 },
    tags: ['npc', 'generated'],
    layer: 'mood',
  },
  procedural_loot: {
    material: { roughness: 0.3, metalness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['reward', 'generated'],
    layer: 'visual_effect',
  },
  procedural_quest: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC00', intensity: 0.15 },
    tags: ['quest', 'generated'],
    layer: 'visual_effect',
  },
  procedural_music: {
    material: { roughness: 0.4 },
    tags: ['audio', 'generated'],
    layer: 'visual_effect',
  },
  procedural_texture: {
    material: { roughness: 0.5 },
    tags: ['surface', 'generated'],
    layer: 'surface',
  },
  procedural_vegetation: {
    material: { roughness: 0.7, color: '#2E8B57' },
    tags: ['nature', 'organic', 'generated'],
    layer: 'environmental',
  },
  procedural_weather: {
    material: { roughness: 0.4 },
    tags: ['atmospheric', 'generated'],
    layer: 'environmental',
  },
  procedural_dialogue: {
    material: { roughness: 0.4 },
    tags: ['ai', 'generated'],
    layer: 'visual_effect',
  },
  noise_generator: {
    material: { roughness: 0.5 },
    emissive: { color: '#888888', intensity: 0.1 },
    tags: ['abstract', 'mathematical'],
    layer: 'visual_effect',
  },
  wave_function_collapse: {
    material: { roughness: 0.4 },
    emissive: { color: '#CC88FF', intensity: 0.15 },
    tags: ['abstract', 'mathematical'],
    layer: 'visual_effect',
  },
  l_system: {
    material: { roughness: 0.6, color: '#2E8B57' },
    tags: ['organic', 'mathematical'],
    layer: 'visual_effect',
  },
  voronoi: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['pattern', 'mathematical'],
    layer: 'visual_effect',
  },
  fractal: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF44FF', intensity: 0.2 },
    tags: ['abstract', 'mathematical', 'recursive'],
    layer: 'visual_effect',
  },
  cellular_automata: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF44', intensity: 0.15 },
    tags: ['pattern', 'animated'],
    layer: 'visual_effect',
  },
  marching_cubes: {
    material: { roughness: 0.5 },
    tags: ['mesh', 'mathematical'],
    layer: 'visual_effect',
  },
  heightmap: {
    material: { roughness: 0.6 },
    tags: ['terrain', 'data'],
    layer: 'environmental',
  },
  erosion: {
    material: { roughness: 0.7, color: '#8B7355' },
    tags: ['terrain', 'natural'],
    layer: 'environmental',
  },
  river_generator: {
    material: { roughness: 0.2, color: '#4488CC' },
    tags: ['water', 'terrain'],
    layer: 'environmental',
  },
  road_generator: {
    material: { roughness: 0.6, color: '#555555' },
    tags: ['urban', 'path'],
    layer: 'environmental',
  },
  cave_generator: {
    material: { roughness: 0.8, color: '#3C3C3C' },
    tags: ['dark', 'underground'],
    layer: 'environmental',
  },
  maze_generator: {
    material: { roughness: 0.6, color: '#6B8E23' },
    tags: ['structure', 'puzzle'],
    layer: 'environmental',
  },
};
