import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for sports & fitness traits (37 traits).
 * Sports equipment, fitness gear, and athletic tracking displays.
 */
export const SPORTS_FITNESS_VISUALS: Record<string, TraitVisualConfig> = {
  throwable_ball: {
    material: { roughness: 0.6, color: '#FF6600' },
    tags: ['sphere', 'interactive'],
    layer: 'physical',
  },
  kickable: { material: { roughness: 0.5 }, tags: ['interactive', 'dynamic'], layer: 'physical' },
  hittable: { material: { roughness: 0.5 }, tags: ['interactive', 'dynamic'], layer: 'physical' },
  racket: {
    material: { roughness: 0.4, color: '#2C3E50' },
    tags: ['equipment', 'grip'],
    layer: 'base_material',
  },
  bat: {
    material: { roughness: 0.5, color: '#8B6914' },
    tags: ['equipment', 'wooden'],
    layer: 'base_material',
  },
  club: {
    material: { roughness: 0.3, metalness: 0.6, color: '#C0C0C0' },
    tags: ['equipment', 'metallic'],
    layer: 'base_material',
  },
  bow: {
    material: { roughness: 0.6, color: '#5C3A1E' },
    tags: ['equipment', 'wooden'],
    layer: 'base_material',
  },
  fishing_rod: {
    material: { roughness: 0.5, color: '#4A3728' },
    tags: ['equipment', 'flexible'],
    layer: 'base_material',
  },
  net: {
    material: { roughness: 0.7, color: '#E8E8E8' },
    opacity: 0.9,
    tags: ['mesh', 'fabric'],
    layer: 'base_material',
  },
  goal: {
    material: { roughness: 0.4, metalness: 0.5, color: '#FFFFFF' },
    tags: ['structure', 'metallic'],
    layer: 'base_material',
  },
  hoop: {
    material: { roughness: 0.3, metalness: 0.7, color: '#FF4500' },
    tags: ['metallic', 'target'],
    layer: 'base_material',
  },
  target: {
    material: { roughness: 0.5, color: '#CC0000' },
    tags: ['marker', 'interactive'],
    layer: 'base_material',
  },
  bullseye: {
    material: { roughness: 0.5, color: '#FFD700' },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['marker', 'highlight'],
    layer: 'base_material',
  },
  scoreboard: {
    material: { roughness: 0.3, metalness: 0.2, color: '#1A1A2E' },
    emissive: { color: '#00FF00', intensity: 0.3 },
    tags: ['display', 'electronic'],
    layer: 'visual_effect',
  },
  timer_display: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#FF0000', intensity: 0.4 },
    tags: ['display', 'electronic'],
    layer: 'visual_effect',
  },
  lap_counter: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFCC00', intensity: 0.3 },
    tags: ['display'],
    layer: 'visual_effect',
  },
  finish_line: {
    material: { roughness: 0.3, color: '#FFFFFF' },
    emissive: { color: '#FFFFFF', intensity: 0.2 },
    tags: ['marker', 'pattern'],
    layer: 'visual_effect',
  },
  starting_block: {
    material: { roughness: 0.5, metalness: 0.3, color: '#555555' },
    tags: ['equipment', 'metallic'],
    layer: 'base_material',
  },
  hurdle: {
    material: { roughness: 0.4, color: '#FF6600' },
    tags: ['obstacle', 'equipment'],
    layer: 'base_material',
  },
  treadmill: {
    material: { roughness: 0.4, metalness: 0.5, color: '#333333' },
    tags: ['equipment', 'electronic', 'metallic'],
    layer: 'base_material',
  },
  stationary_bike: {
    material: { roughness: 0.3, metalness: 0.6, color: '#2C2C2C' },
    tags: ['equipment', 'metallic'],
    layer: 'base_material',
  },
  rowing_machine: {
    material: { roughness: 0.4, metalness: 0.5, color: '#444444' },
    tags: ['equipment', 'metallic'],
    layer: 'base_material',
  },
  punching_bag: {
    material: { roughness: 0.8, color: '#8B0000' },
    tags: ['equipment', 'leather'],
    layer: 'base_material',
  },
  yoga_mat: {
    material: { roughness: 0.9, color: '#6A0DAD' },
    tags: ['equipment', 'rubber'],
    layer: 'base_material',
  },
  balance_board: {
    material: { roughness: 0.5, color: '#C4A882' },
    tags: ['equipment', 'wooden'],
    layer: 'base_material',
  },
  jump_rope: {
    material: { roughness: 0.6, color: '#222222' },
    tags: ['equipment', 'flexible'],
    layer: 'base_material',
  },
  weight: {
    material: { roughness: 0.3, metalness: 0.9, color: '#4A4A4A' },
    tags: ['equipment', 'metallic', 'heavy'],
    layer: 'base_material',
  },
  dumbbell: {
    material: { roughness: 0.3, metalness: 0.9, color: '#555555' },
    tags: ['equipment', 'metallic', 'heavy'],
    layer: 'base_material',
  },
  kettlebell: {
    material: { roughness: 0.4, metalness: 0.8, color: '#333333' },
    tags: ['equipment', 'metallic', 'heavy'],
    layer: 'base_material',
  },
  resistance_band: {
    material: { roughness: 0.7, color: '#FF4444' },
    tags: ['equipment', 'elastic'],
    layer: 'base_material',
  },
  heart_rate_monitor: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#FF0000', intensity: 0.3 },
    tags: ['electronic', 'medical'],
    layer: 'visual_effect',
  },
  calorie_tracker: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#44FF44', intensity: 0.2 },
    tags: ['electronic', 'display'],
    layer: 'visual_effect',
  },
  rep_counter: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFCC00', intensity: 0.2 },
    tags: ['display'],
    layer: 'visual_effect',
  },
  form_checker: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.2 },
    tags: ['ai', 'display'],
    layer: 'visual_effect',
  },
  coach: {
    material: { roughness: 0.5 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['npc', 'authority'],
    layer: 'mood',
  },
  opponent: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF4444', intensity: 0.15 },
    tags: ['npc', 'hostile'],
    layer: 'mood',
  },
  teammate: {
    material: { roughness: 0.5 },
    emissive: { color: '#44CC44', intensity: 0.15 },
    tags: ['npc', 'friendly'],
    layer: 'mood',
  },
};
