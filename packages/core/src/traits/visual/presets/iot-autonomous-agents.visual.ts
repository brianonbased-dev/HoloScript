import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for IoT/autonomous-agents traits (14 traits).
 * IoT devices, digital twins, and autonomous AI agents.
 */
export const IOT_AUTONOMOUS_AGENTS_VISUALS: Record<string, TraitVisualConfig> = {
  sensor: {
    material: { roughness: 0.3, metalness: 0.4, color: '#444444' },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['electronic', 'monitoring'],
    layer: 'visual_effect',
  },
  digital_twin: {
    material: { roughness: 0.3 },
    opacity: 0.8,
    emissive: { color: '#4488FF', intensity: 0.2 },
    tags: ['virtual', 'mirror'],
    layer: 'visual_effect',
  },
  data_binding: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CCFF', intensity: 0.1 },
    tags: ['data', 'connected'],
    layer: 'visual_effect',
  },
  alert: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF4400', intensity: 0.35 },
    tags: ['notification', 'urgent'],
    layer: 'visual_effect',
  },
  heatmap_3d: {
    material: { roughness: 0.3 },
    emissive: { color: '#FF4400', intensity: 0.25 },
    tags: ['data', 'thermal'],
    layer: 'visual_effect',
  },
  behavior_tree: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.15 },
    tags: ['ai', 'structure'],
    layer: 'visual_effect',
  },
  goal_oriented: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['ai', 'purposeful'],
    layer: 'mood',
  },
  llm_agent: {
    material: { roughness: 0.3 },
    emissive: { color: '#AA88FF', intensity: 0.2 },
    tags: ['ai', 'conversational'],
    layer: 'visual_effect',
  },
  memory: {
    material: { roughness: 0.4 },
    emissive: { color: '#88AAFF', intensity: 0.1 },
    tags: ['ai', 'storage'],
    layer: 'visual_effect',
  },
  perception: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CCFF', intensity: 0.15 },
    tags: ['ai', 'sensing'],
    layer: 'visual_effect',
  },
  emotion: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF88CC', intensity: 0.15 },
    tags: ['ai', 'expressive'],
    layer: 'mood',
  },
  dialogue: {
    material: { roughness: 0.4 },
    emissive: { color: '#66BBFF', intensity: 0.1 },
    tags: ['ai', 'social'],
    layer: 'visual_effect',
  },
  faction: {
    material: { roughness: 0.5 },
    emissive: { color: '#CC4444', intensity: 0.1 },
    tags: ['social', 'group'],
    layer: 'mood',
  },
  patrol: {
    material: { roughness: 0.5 },
    tags: ['movement', 'routine'],
    layer: 'mood',
  },
};
