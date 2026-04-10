import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for narrative/storytelling traits (12 traits).
 * Story and narrative UI cues for cinematic and investigative elements.
 */
export const NARRATIVE_STORYTELLING_VISUALS: Record<string, TraitVisualConfig> = {
  narrator_trigger: {
    material: { roughness: 0.3 },
    emissive: { color: '#FFD700', intensity: 0.2 },
    tags: ['story', 'trigger'],
    layer: 'visual_effect',
  },
  cutscene: {
    material: { roughness: 0.3 },
    emissive: { color: '#4488CC', intensity: 0.15 },
    tags: ['cinematic'],
    layer: 'visual_effect',
  },
  flashback: {
    material: { roughness: 0.4 },
    opacity: 0.8,
    emissive: { color: '#C4A882', intensity: 0.1 },
    tags: ['temporal', 'faded'],
    layer: 'visual_effect',
  },
  foreshadow: {
    material: { roughness: 0.3 },
    opacity: 0.7,
    emissive: { color: '#8866CC', intensity: 0.2 },
    tags: ['temporal', 'mystical'],
    layer: 'visual_effect',
  },
  journal_entry: {
    material: { roughness: 0.7, color: '#D4C5A0' },
    tags: ['paper', 'readable'],
    layer: 'visual_effect',
  },
  lore: {
    material: { roughness: 0.5 },
    emissive: { color: '#CCAA44', intensity: 0.15 },
    tags: ['ancient', 'knowledge'],
    layer: 'visual_effect',
  },
  clue: {
    material: { roughness: 0.4 },
    emissive: { color: '#FFDD00', intensity: 0.25 },
    tags: ['important', 'highlight'],
    layer: 'visual_effect',
  },
  evidence: {
    material: { roughness: 0.5 },
    emissive: { color: '#FF8844', intensity: 0.2 },
    tags: ['important', 'forensic'],
    layer: 'visual_effect',
  },
  witness: {
    material: { roughness: 0.5 },
    emissive: { color: '#66AAFF', intensity: 0.15 },
    tags: ['social', 'important'],
    layer: 'visual_effect',
  },
  suspect: {
    material: { roughness: 0.5, color: '#4A2020' },
    emissive: { color: '#FF4444', intensity: 0.15 },
    tags: ['dark', 'important'],
    layer: 'visual_effect',
  },
  alibi: {
    material: { roughness: 0.5 },
    emissive: { color: '#44CC88', intensity: 0.1 },
    tags: ['social'],
    layer: 'visual_effect',
  },
  testimony: {
    material: { roughness: 0.4 },
    emissive: { color: '#88AACC', intensity: 0.1 },
    tags: ['social', 'readable'],
    layer: 'visual_effect',
  },
};
