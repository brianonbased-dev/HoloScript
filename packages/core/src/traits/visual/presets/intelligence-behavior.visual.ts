import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for intelligence/behavior traits (43 traits).
 * AI and behavior state indicators — emissive hints for behavior states.
 */
export const INTELLIGENCE_BEHAVIOR_VISUALS: Record<string, TraitVisualConfig> = {
  autonomous: {
    material: { roughness: 0.4 },
    emissive: { color: '#44AAFF', intensity: 0.2 },
    tags: ['ai', 'active'],
    layer: 'mood',
  },
  scripted: {
    material: { roughness: 0.4 },
    emissive: { color: '#888888', intensity: 0.1 },
    tags: ['system'],
    layer: 'mood',
  },
  adaptive: {
    material: { roughness: 0.4 },
    emissive: { color: '#44FF88', intensity: 0.2 },
    tags: ['ai', 'dynamic'],
    layer: 'mood',
  },
  pathfinding: {
    material: { roughness: 0.5 },
    tags: ['system', 'movement'],
    layer: 'mood',
  },
  flocking: {
    material: { roughness: 0.5 },
    tags: ['collective', 'movement'],
    layer: 'mood',
  },
  swarming: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF8800', intensity: 0.15 },
    tags: ['collective', 'movement'],
    layer: 'mood',
  },
  conversational: {
    material: { roughness: 0.4 },
    emissive: { color: '#66BBFF', intensity: 0.1 },
    tags: ['social', 'ai'],
    layer: 'mood',
  },
  teachable: {
    material: { roughness: 0.5 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['learning'],
    layer: 'mood',
  },
  tameable: {
    material: { roughness: 0.6 },
    tags: ['animal', 'interactive'],
    layer: 'mood',
  },
  friendly: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CC44', intensity: 0.2 },
    tags: ['social', 'positive'],
    layer: 'mood',
  },
  hostile: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF2200', intensity: 0.25 },
    tags: ['combat', 'danger'],
    layer: 'mood',
  },
  neutral: {
    material: { roughness: 0.5 },
    tags: ['passive'],
    layer: 'mood',
  },
  territorial: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF6600', intensity: 0.15 },
    tags: ['aggressive'],
    layer: 'mood',
  },
  nocturnal: {
    material: { roughness: 0.5, color: '#1A1A2E' },
    emissive: { color: '#4444FF', intensity: 0.15 },
    tags: ['dark', 'night'],
    layer: 'mood',
  },
  migratory: {
    material: { roughness: 0.5 },
    tags: ['movement', 'nature'],
    layer: 'mood',
  },
  predator: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF4400', intensity: 0.2 },
    tags: ['danger', 'aggressive'],
    layer: 'mood',
  },
  prey: {
    material: { roughness: 0.6, color: '#C4B99A' },
    tags: ['nature', 'passive'],
    layer: 'mood',
  },
  pack_animal: {
    material: { roughness: 0.6 },
    tags: ['collective', 'animal'],
    layer: 'mood',
  },
  solitary: {
    material: { roughness: 0.6 },
    opacity: 0.9,
    tags: ['isolated'],
    layer: 'mood',
  },
  curious: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC44', intensity: 0.15 },
    tags: ['active', 'positive'],
    layer: 'mood',
  },
  fearful: {
    material: { roughness: 0.6 },
    emissive: { color: '#8888CC', intensity: 0.1 },
    tags: ['passive', 'nervous'],
    layer: 'mood',
  },
  aggressive: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF2200', intensity: 0.3 },
    tags: ['combat', 'danger'],
    layer: 'mood',
  },
  passive: {
    material: { roughness: 0.6 },
    tags: ['calm'],
    layer: 'mood',
  },
  protective: {
    material: { roughness: 0.4, metalness: 0.3 },
    emissive: { color: '#4488FF', intensity: 0.2 },
    tags: ['shield', 'friendly'],
    layer: 'mood',
  },
  playful: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF88CC', intensity: 0.15 },
    tags: ['positive', 'active'],
    layer: 'mood',
  },
  mischievous: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF66FF', intensity: 0.15 },
    tags: ['tricky'],
    layer: 'mood',
  },
  wise: {
    material: { roughness: 0.3 },
    emissive: { color: '#88AAFF', intensity: 0.2 },
    tags: ['knowledge', 'calm'],
    layer: 'mood',
  },
  ancient: {
    material: { roughness: 0.7, color: '#8B8378' },
    emissive: { color: '#CCAA44', intensity: 0.1 },
    tags: ['old', 'powerful'],
    layer: 'mood',
  },
  baby: {
    material: { roughness: 0.6 },
    scale: [0.5, 0.5, 0.5],
    tags: ['young', 'small'],
    layer: 'mood',
  },
  elder: {
    material: { roughness: 0.6, color: '#C0C0C0' },
    emissive: { color: '#88AACC', intensity: 0.1 },
    tags: ['old', 'wise'],
    layer: 'mood',
  },
  legendary: {
    material: { roughness: 0.2, metalness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.35 },
    tags: ['epic', 'powerful'],
    layer: 'mood',
  },
  mythical: {
    material: { roughness: 0.2 },
    emissive: { color: '#CC88FF', intensity: 0.3 },
    tags: ['magic', 'epic'],
    layer: 'mood',
  },
  mechanical: {
    material: { roughness: 0.3, metalness: 0.8 },
    tags: ['metallic', 'constructed'],
    layer: 'mood',
  },
  organic: {
    material: { roughness: 0.7, color: '#6B8E23' },
    tags: ['nature', 'living'],
    layer: 'mood',
  },
  hybrid: {
    material: { roughness: 0.5, metalness: 0.4 },
    emissive: { color: '#44FFAA', intensity: 0.15 },
    tags: ['mixed', 'tech'],
    layer: 'mood',
  },
  shapeshifter: {
    material: { roughness: 0.3 },
    emissive: { color: '#AA44FF', intensity: 0.25 },
    shader: 'morph',
    tags: ['magic', 'dynamic'],
    layer: 'mood',
  },
  invisible_agent: {
    material: { roughness: 0.3, transparent: true, opacity: 0.15 },
    tags: ['stealth', 'invisible'],
    layer: 'mood',
  },
  omniscient: {
    material: { roughness: 0.1 },
    emissive: { color: '#FFFFFF', intensity: 0.4 },
    tags: ['divine', 'powerful'],
    layer: 'mood',
  },
};
