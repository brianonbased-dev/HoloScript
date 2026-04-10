import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for safety and boundary traits (14 traits).
 * Game zones and safety regions.
 */
export const SAFETY_BOUNDARIES_VISUALS: Record<string, TraitVisualConfig> = {
  safe_zone: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FF88', intensity: 0.2 },
    opacity: 0.4,
    tags: ['zone', 'protective'],
    layer: 'environmental',
  },
  hazard: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF4400', intensity: 0.3 },
    tags: ['danger', 'warning'],
    layer: 'environmental',
  },
  boundary: {
    material: { roughness: 0.3 },
    opacity: 0.5,
    emissive: { color: '#FF8800', intensity: 0.2 },
    tags: ['zone', 'limit'],
    layer: 'environmental',
  },
  trigger: {
    material: { roughness: 0.3 },
    opacity: 0.3,
    emissive: { color: '#FFDD00', intensity: 0.15 },
    tags: ['invisible', 'interactive'],
    layer: 'environmental',
  },
  checkpoint: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.3 },
    tags: ['marker', 'progress'],
    layer: 'visual_effect',
  },
  respawn: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FF88', intensity: 0.35 },
    particleEffect: 'sparkle',
    tags: ['spawn', 'glowing'],
    layer: 'visual_effect',
  },
  no_build: {
    material: { roughness: 0.5, color: '#FF4444' },
    opacity: 0.3,
    tags: ['zone', 'restricted'],
    layer: 'environmental',
  },
  no_fly: {
    material: { roughness: 0.5, color: '#FF8844' },
    opacity: 0.3,
    tags: ['zone', 'restricted'],
    layer: 'environmental',
  },
  pvp_zone: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF2200', intensity: 0.25 },
    opacity: 0.3,
    tags: ['zone', 'combat'],
    layer: 'environmental',
  },
  pve_zone: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF8800', intensity: 0.2 },
    opacity: 0.3,
    tags: ['zone', 'combat'],
    layer: 'environmental',
  },
  spectator_zone: {
    material: { roughness: 0.3 },
    opacity: 0.2,
    emissive: { color: '#88AAFF', intensity: 0.15 },
    tags: ['zone', 'passive'],
    layer: 'environmental',
  },
  tutorial_zone: {
    material: { roughness: 0.3 },
    emissive: { color: '#44CCFF', intensity: 0.2 },
    opacity: 0.3,
    tags: ['zone', 'educational'],
    layer: 'environmental',
  },
  boss_arena: {
    material: { roughness: 0.5, color: '#2E0A0A' },
    emissive: { color: '#FF0000', intensity: 0.3 },
    tags: ['zone', 'combat', 'epic'],
    layer: 'environmental',
  },
  spawn_point: {
    material: { roughness: 0.3 },
    emissive: { color: '#88FF88', intensity: 0.3 },
    particleEffect: 'sparkle',
    tags: ['marker', 'spawn'],
    layer: 'visual_effect',
  },
};
