import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for interop/co-presence traits (16 traits).
 * Interoperability formats and multi-user presence indicators.
 */
export const INTEROP_COPRESENCE_VISUALS: Record<string, TraitVisualConfig> = {
  usd: {
    material: { roughness: 0.4 },
    tags: ['format', 'technical'],
    layer: 'visual_effect',
  },
  gltf: {
    material: { roughness: 0.4 },
    tags: ['format', 'technical'],
    layer: 'visual_effect',
  },
  fbx: {
    material: { roughness: 0.4 },
    tags: ['format', 'technical'],
    layer: 'visual_effect',
  },
  material_x: {
    material: { roughness: 0.4 },
    tags: ['format', 'technical'],
    layer: 'visual_effect',
  },
  scene_graph: {
    material: { roughness: 0.4 },
    tags: ['structure', 'technical'],
    layer: 'visual_effect',
  },
  co_located: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['social', 'spatial'],
    layer: 'visual_effect',
  },
  remote_presence: {
    material: { roughness: 0.3 },
    opacity: 0.85,
    emissive: { color: '#4488FF', intensity: 0.2 },
    tags: ['social', 'remote'],
    layer: 'visual_effect',
  },
  shared_world: {
    material: { roughness: 0.4 },
    emissive: { color: '#66CCAA', intensity: 0.15 },
    tags: ['social', 'spatial'],
    layer: 'visual_effect',
  },
  voice_proximity: {
    material: { roughness: 0.4 },
    tags: ['audio', 'social'],
    layer: 'visual_effect',
  },
  avatar_embodiment: {
    material: { roughness: 0.5 },
    tags: ['avatar', 'social'],
    layer: 'visual_effect',
  },
  lip_sync: {
    material: { roughness: 0.5 },
    tags: ['animated', 'audio'],
    layer: 'visual_effect',
  },
  emotion_directive: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF88CC', intensity: 0.15 },
    tags: ['emotion', 'animated'],
    layer: 'visual_effect',
  },
  stt: {
    material: { roughness: 0.4 },
    tags: ['audio', 'ai'],
    layer: 'visual_effect',
  },
  tts: {
    material: { roughness: 0.4 },
    tags: ['audio', 'ai'],
    layer: 'visual_effect',
  },
  spectator: {
    material: { roughness: 0.3 },
    opacity: 0.7,
    tags: ['passive', 'observer'],
    layer: 'visual_effect',
  },
  role: {
    material: { roughness: 0.4 },
    tags: ['social', 'system'],
    layer: 'visual_effect',
  },
};
