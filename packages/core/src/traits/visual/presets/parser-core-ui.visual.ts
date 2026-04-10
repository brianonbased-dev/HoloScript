import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for parser-core/UI traits (18 traits).
 * Core parser traits, UI widgets, and platform modes.
 */
export const PARSER_CORE_UI_VISUALS: Record<string, TraitVisualConfig> = {
  physics: {
    material: { roughness: 0.5 },
    tags: ['simulated', 'dynamic'],
    layer: 'physical',
  },
  draggable: {
    material: { roughness: 0.5 },
    emissive: { color: '#44AAFF', intensity: 0.05 },
    tags: ['interactive', 'movable'],
    layer: 'physical',
  },
  static: {
    material: { roughness: 0.6 },
    tags: ['fixed', 'immovable'],
    layer: 'physical',
  },
  kinematic: {
    material: { roughness: 0.5 },
    tags: ['animated', 'scripted'],
    layer: 'physical',
  },
  local_only: {
    material: { roughness: 0.5 },
    tags: ['private', 'local'],
    layer: 'visual_effect',
  },
  visible: {
    material: { roughness: 0.5 },
    tags: ['rendered', 'default'],
    layer: 'visual_effect',
  },
  invisible: {
    material: { roughness: 0.5 },
    opacity: 0.0,
    tags: ['hidden', 'system'],
    layer: 'visual_effect',
  },
  audio: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCFF', intensity: 0.1 },
    tags: ['sound', 'emitter'],
    layer: 'visual_effect',
  },
  portal: {
    material: { roughness: 0.2 },
    emissive: { color: '#AA44FF', intensity: 0.3 },
    shader: 'portal',
    tags: ['teleport', 'magic'],
    layer: 'visual_effect',
  },
  vr_only: {
    material: { roughness: 0.4 },
    tags: ['vr', 'exclusive'],
    layer: 'visual_effect',
  },
  ar_only: {
    material: { roughness: 0.4 },
    tags: ['ar', 'exclusive'],
    layer: 'visual_effect',
  },
  desktop_only: {
    material: { roughness: 0.4 },
    tags: ['desktop', 'exclusive'],
    layer: 'visual_effect',
  },
  ui_floating: {
    material: { roughness: 0.2, color: '#1A1A2E' },
    opacity: 0.9,
    emissive: { color: '#4488FF', intensity: 0.15 },
    tags: ['ui', 'hovering'],
    layer: 'visual_effect',
  },
  ui_anchored: {
    material: { roughness: 0.3, color: '#1A1A2E' },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['ui', 'fixed'],
    layer: 'visual_effect',
  },
  ui_hand_menu: {
    material: { roughness: 0.2, color: '#1A1A2E' },
    emissive: { color: '#44CCFF', intensity: 0.15 },
    tags: ['ui', 'hand'],
    layer: 'visual_effect',
  },
  ui_billboard: {
    material: { roughness: 0.3 },
    tags: ['ui', 'camera-facing'],
    layer: 'visual_effect',
  },
  ui_curved: {
    material: { roughness: 0.2, color: '#1A1A2E' },
    emissive: { color: '#4488FF', intensity: 0.1 },
    tags: ['ui', 'ergonomic'],
    layer: 'visual_effect',
  },
  ui_docked: {
    material: { roughness: 0.3, color: '#1A1A2E' },
    tags: ['ui', 'attached'],
    layer: 'visual_effect',
  },
};
