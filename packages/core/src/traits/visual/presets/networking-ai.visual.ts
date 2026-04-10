import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for networking/AI traits (8 traits).
 * Networking and AI integration traits.
 */
export const NETWORKING_AI_VISUALS: Record<string, TraitVisualConfig> = {
  networked: {
    material: { roughness: 0.4 },
    emissive: { color: '#44AAFF', intensity: 0.1 },
    tags: ['connected', 'multiplayer'],
    layer: 'visual_effect',
  },
  proactive: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['ai', 'active'],
    layer: 'mood',
  },
  ai_driven: {
    material: { roughness: 0.3 },
    emissive: { color: '#AA88FF', intensity: 0.2 },
    tags: ['ai', 'autonomous'],
    layer: 'visual_effect',
  },
  agent_protocol: {
    material: { roughness: 0.3 },
    emissive: { color: '#4488FF', intensity: 0.15 },
    tags: ['ai', 'system'],
    layer: 'visual_effect',
  },
  narrator: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.15 },
    tags: ['voice', 'story'],
    layer: 'mood',
  },
  responsive: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CCFF', intensity: 0.1 },
    tags: ['interactive', 'reactive'],
    layer: 'visual_effect',
  },
  procedural: {
    material: { roughness: 0.5 },
    emissive: { color: '#88CC44', intensity: 0.1 },
    tags: ['generated', 'dynamic'],
    layer: 'visual_effect',
  },
  captioned: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#FFFFFF', intensity: 0.15 },
    tags: ['text', 'accessibility'],
    layer: 'visual_effect',
  },
};
