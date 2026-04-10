import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for education & learning traits (39 traits).
 * Educational tools, interactive learning elements, and academic displays.
 */
export const EDUCATION_LEARNING_VISUALS: Record<string, TraitVisualConfig> = {
  lesson: {
    material: { roughness: 0.4 },
    emissive: { color: '#4488FF', intensity: 0.15 },
    tags: ['educational', 'interactive'],
    layer: 'visual_effect',
  },
  quiz: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF8800', intensity: 0.2 },
    tags: ['educational', 'interactive'],
    layer: 'visual_effect',
  },
  flashcard: {
    material: { roughness: 0.3, color: '#FFFFF0' },
    tags: ['paper', 'readable'],
    layer: 'base_material',
  },
  tutorial: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CCFF', intensity: 0.15 },
    tags: ['educational', 'guided'],
    layer: 'visual_effect',
  },
  demonstration: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFCC00', intensity: 0.15 },
    tags: ['educational', 'highlight'],
    layer: 'visual_effect',
  },
  lab_experiment: {
    material: { roughness: 0.2, transmission: 0.5, ior: 1.5 },
    tags: ['glass', 'scientific'],
    layer: 'base_material',
  },
  dissectable: {
    material: { roughness: 0.6 },
    tags: ['interactive', 'anatomical'],
    layer: 'physical',
  },
  microscopic: {
    material: { roughness: 0.3 },
    scale: [0.1, 0.1, 0.1],
    tags: ['tiny', 'scientific'],
    layer: 'scale',
  },
  telescopic: {
    material: { roughness: 0.3 },
    scale: [3.0, 3.0, 3.0],
    tags: ['large', 'scientific'],
    layer: 'scale',
  },
  zoomable: { material: { roughness: 0.3 }, tags: ['interactive', 'scalable'], layer: 'physical' },
  layered: { material: { roughness: 0.4 }, tags: ['structured', 'interactive'], layer: 'physical' },
  cross_section: {
    material: { roughness: 0.4 },
    tags: ['cutaway', 'educational'],
    layer: 'visual_effect',
  },
  time_lapse: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFAA44', intensity: 0.1 },
    tags: ['temporal', 'animated'],
    layer: 'visual_effect',
  },
  slow_motion: {
    material: { roughness: 0.4 },
    tags: ['temporal', 'animated'],
    layer: 'visual_effect',
  },
  replayable: {
    material: { roughness: 0.4 },
    tags: ['interactive', 'temporal'],
    layer: 'visual_effect',
  },
  gradeable: {
    material: { roughness: 0.4 },
    emissive: { color: '#44CC44', intensity: 0.1 },
    tags: ['educational', 'assessment'],
    layer: 'visual_effect',
  },
  hint_system: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFDD00', intensity: 0.2 },
    tags: ['educational', 'helpful'],
    layer: 'visual_effect',
  },
  achievement: {
    material: { roughness: 0.2, metalness: 0.5, color: '#FFD700' },
    emissive: { color: '#FFD700', intensity: 0.25 },
    tags: ['reward', 'metallic'],
    layer: 'visual_effect',
  },
  badge: {
    material: { roughness: 0.2, metalness: 0.6, color: '#C0C0C0' },
    tags: ['reward', 'metallic'],
    layer: 'visual_effect',
  },
  certificate: {
    material: { roughness: 0.5, color: '#FFFFF0' },
    tags: ['paper', 'reward'],
    layer: 'base_material',
  },
  leaderboard: {
    material: { roughness: 0.3, color: '#1A1A2E' },
    emissive: { color: '#FFD700', intensity: 0.2 },
    tags: ['display', 'competitive'],
    layer: 'visual_effect',
  },
  progress_tracker: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FF88', intensity: 0.15 },
    tags: ['display', 'tracking'],
    layer: 'visual_effect',
  },
  skill_tree: {
    material: { roughness: 0.3 },
    emissive: { color: '#88CCFF', intensity: 0.2 },
    tags: ['display', 'structured'],
    layer: 'visual_effect',
  },
  knowledge_check: {
    material: { roughness: 0.4 },
    emissive: { color: '#FF8800', intensity: 0.15 },
    tags: ['educational', 'assessment'],
    layer: 'visual_effect',
  },
  vocabulary: {
    material: { roughness: 0.4 },
    tags: ['text', 'educational'],
    layer: 'visual_effect',
  },
  pronunciation: {
    material: { roughness: 0.4 },
    tags: ['audio', 'educational'],
    layer: 'visual_effect',
  },
  translation: {
    material: { roughness: 0.4 },
    emissive: { color: '#66AAFF', intensity: 0.1 },
    tags: ['text', 'educational'],
    layer: 'visual_effect',
  },
  historical: {
    material: { roughness: 0.6, color: '#C4A882' },
    tags: ['aged', 'educational'],
    layer: 'environmental',
  },
  scientific: {
    material: { roughness: 0.3 },
    emissive: { color: '#44CCFF', intensity: 0.1 },
    tags: ['technical', 'educational'],
    layer: 'visual_effect',
  },
  mathematical: {
    material: { roughness: 0.3 },
    emissive: { color: '#88AAFF', intensity: 0.1 },
    tags: ['abstract', 'educational'],
    layer: 'visual_effect',
  },
  geographic: {
    material: { roughness: 0.5, color: '#4A8C5E' },
    tags: ['earth', 'educational'],
    layer: 'environmental',
  },
  anatomical: {
    material: { roughness: 0.6, color: '#D2A679' },
    tags: ['organic', 'educational'],
    layer: 'base_material',
  },
  astronomical: {
    material: { roughness: 0.3, color: '#0A0A2E' },
    emissive: { color: '#FFFFFF', intensity: 0.3 },
    tags: ['space', 'educational'],
    layer: 'environmental',
  },
  chemical: {
    material: { roughness: 0.2, transmission: 0.5, ior: 1.5 },
    tags: ['glass', 'scientific'],
    layer: 'base_material',
  },
  biological: {
    material: { roughness: 0.6, color: '#6B8E23' },
    tags: ['organic', 'educational'],
    layer: 'base_material',
  },
  geological: {
    material: { roughness: 0.7, color: '#8B7355' },
    tags: ['mineral', 'educational'],
    layer: 'base_material',
  },
  archaeological_artifact: {
    material: { roughness: 0.7, color: '#C4A882' },
    tags: ['ancient', 'valuable'],
    layer: 'condition',
  },
  museum_exhibit: {
    material: { roughness: 0.3, envMapIntensity: 1.2 },
    emissive: { color: '#FFFFFF', intensity: 0.1 },
    tags: ['display', 'protected'],
    layer: 'visual_effect',
  },
  gallery_piece: {
    material: { roughness: 0.3, envMapIntensity: 1.3 },
    tags: ['display', 'art'],
    layer: 'visual_effect',
  },
};
