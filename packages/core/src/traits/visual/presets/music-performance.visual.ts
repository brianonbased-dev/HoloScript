import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for music & performance traits (36 traits).
 * Musical instruments, audio equipment, and performance venues.
 */
export const MUSIC_PERFORMANCE_VISUALS: Record<string, TraitVisualConfig> = {
  piano: {
    material: { roughness: 0.1, metalness: 0.0, color: '#1A1A1A', envMapIntensity: 1.3 },
    tags: ['instrument', 'glossy'],
    layer: 'base_material',
  },
  guitar: {
    material: { roughness: 0.5, color: '#8B4513' },
    tags: ['instrument', 'wooden'],
    layer: 'base_material',
  },
  drums: {
    material: { roughness: 0.4, metalness: 0.5, color: '#C0C0C0' },
    tags: ['instrument', 'metallic'],
    layer: 'base_material',
  },
  violin: {
    material: { roughness: 0.4, color: '#8B2500' },
    tags: ['instrument', 'wooden', 'glossy'],
    layer: 'base_material',
  },
  flute: {
    material: { roughness: 0.2, metalness: 0.9, color: '#C0C0C0' },
    tags: ['instrument', 'metallic', 'reflective'],
    layer: 'base_material',
  },
  trumpet: {
    material: { roughness: 0.15, metalness: 0.95, color: '#FFD700', envMapIntensity: 1.5 },
    tags: ['instrument', 'metallic', 'brass'],
    layer: 'base_material',
  },
  saxophone: {
    material: { roughness: 0.15, metalness: 0.9, color: '#DAA520', envMapIntensity: 1.4 },
    tags: ['instrument', 'metallic', 'brass'],
    layer: 'base_material',
  },
  bass: {
    material: { roughness: 0.5, color: '#2F1B0E' },
    tags: ['instrument', 'wooden'],
    layer: 'base_material',
  },
  harp: {
    material: { roughness: 0.3, metalness: 0.3, color: '#DAA520' },
    tags: ['instrument', 'elegant'],
    layer: 'base_material',
  },
  organ: {
    material: { roughness: 0.4, color: '#4A3728' },
    tags: ['instrument', 'wooden', 'large'],
    layer: 'base_material',
  },
  turntable: {
    material: { roughness: 0.3, metalness: 0.4, color: '#2C2C2C' },
    tags: ['electronic', 'dj'],
    layer: 'base_material',
  },
  mixer: {
    material: { roughness: 0.3, metalness: 0.3, color: '#1A1A1A' },
    emissive: { color: '#00FF00', intensity: 0.15 },
    tags: ['electronic', 'dj'],
    layer: 'base_material',
  },
  microphone: {
    material: { roughness: 0.2, metalness: 0.8, color: '#C0C0C0' },
    tags: ['equipment', 'metallic'],
    layer: 'base_material',
  },
  amplifier: {
    material: { roughness: 0.6, color: '#1A1A1A' },
    tags: ['electronic', 'speaker'],
    layer: 'base_material',
  },
  speaker: {
    material: { roughness: 0.5, color: '#222222' },
    tags: ['electronic', 'audio'],
    layer: 'base_material',
  },
  headphones: {
    material: { roughness: 0.3, metalness: 0.3, color: '#1A1A1A' },
    tags: ['equipment', 'wearable'],
    layer: 'base_material',
  },
  equalizer: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#44AAFF', intensity: 0.2 },
    tags: ['electronic', 'display'],
    layer: 'visual_effect',
  },
  loop_station: {
    material: { roughness: 0.3, color: '#2C2C2C' },
    emissive: { color: '#FF8800', intensity: 0.15 },
    tags: ['electronic'],
    layer: 'base_material',
  },
  sequencer: {
    material: { roughness: 0.3, color: '#1A1A2E' },
    emissive: { color: '#FF44FF', intensity: 0.2 },
    tags: ['electronic', 'display'],
    layer: 'visual_effect',
  },
  sampler: {
    material: { roughness: 0.3, color: '#2C2C2C' },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['electronic'],
    layer: 'base_material',
  },
  midi_controller: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#4488FF', intensity: 0.15 },
    tags: ['electronic', 'interactive'],
    layer: 'base_material',
  },
  light_show: {
    material: { roughness: 0.2 },
    emissive: { color: '#FF00FF', intensity: 0.5 },
    tags: ['lighting', 'animated'],
    layer: 'lighting',
  },
  stage: {
    material: { roughness: 0.5, color: '#2C2C2C' },
    tags: ['structure', 'platform'],
    layer: 'environmental',
  },
  audience: { material: { roughness: 0.6 }, tags: ['social', 'crowd'], layer: 'environmental' },
  dance_floor: {
    material: { roughness: 0.2, color: '#1A1A2E' },
    emissive: { color: '#FF00FF', intensity: 0.3 },
    tags: ['platform', 'lighting'],
    layer: 'environmental',
  },
  dj_booth: {
    material: { roughness: 0.3, color: '#1A1A1A' },
    emissive: { color: '#FF4488', intensity: 0.2 },
    tags: ['structure', 'electronic'],
    layer: 'environmental',
  },
  recording_studio: {
    material: { roughness: 0.7, color: '#2C2C2C' },
    tags: ['room', 'acoustic'],
    layer: 'environmental',
  },
  concert_hall: {
    material: { roughness: 0.4, color: '#4A3728' },
    tags: ['room', 'elegant'],
    layer: 'environmental',
  },
  amphitheater: {
    material: { roughness: 0.6, color: '#C4B99A' },
    tags: ['structure', 'stone'],
    layer: 'environmental',
  },
  karaoke: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF44FF', intensity: 0.2 },
    tags: ['entertainment', 'social'],
    layer: 'visual_effect',
  },
  lyrics_display: {
    material: { roughness: 0.2, color: '#111111' },
    emissive: { color: '#FFFFFF', intensity: 0.4 },
    tags: ['display', 'text'],
    layer: 'visual_effect',
  },
  music_visualizer: {
    material: { roughness: 0.2 },
    emissive: { color: '#44AAFF', intensity: 0.4 },
    tags: ['display', 'animated'],
    layer: 'visual_effect',
  },
  beat_detector: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF4400', intensity: 0.3 },
    tags: ['audio', 'reactive'],
    layer: 'visual_effect',
  },
  tempo: { material: { roughness: 0.4 }, tags: ['audio', 'system'], layer: 'visual_effect' },
  key_signature: {
    material: { roughness: 0.4 },
    tags: ['audio', 'notation'],
    layer: 'visual_effect',
  },
  chord_progression: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['audio', 'notation'],
    layer: 'visual_effect',
  },
};
