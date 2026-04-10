import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for physical affordance traits (22 traits).
 * Mechanical parts and physical interaction widgets.
 */
export const PHYSICAL_AFFORDANCES_VISUALS: Record<string, TraitVisualConfig> = {
  knob: {
    material: { roughness: 0.4, metalness: 0.5, color: '#888888' },
    tags: ['metallic', 'interactive', 'rotatable'],
    layer: 'physical',
  },
  dial: {
    material: { roughness: 0.3, metalness: 0.6, color: '#C0C0C0' },
    tags: ['metallic', 'interactive', 'rotatable'],
    layer: 'physical',
  },
  crank: {
    material: { roughness: 0.5, metalness: 0.7, color: '#666666' },
    tags: ['metallic', 'mechanical'],
    layer: 'physical',
  },
  handle: {
    material: { roughness: 0.5, color: '#8B6914' },
    tags: ['grip', 'interactive'],
    layer: 'physical',
  },
  valve: {
    material: { roughness: 0.4, metalness: 0.8, color: '#B87333' },
    tags: ['metallic', 'rotatable', 'pipe'],
    layer: 'physical',
  },
  joystick: {
    material: { roughness: 0.5, color: '#333333' },
    tags: ['interactive', 'controller'],
    layer: 'physical',
  },
  steering_wheel: {
    material: { roughness: 0.5, color: '#2C2C2C' },
    tags: ['interactive', 'rotatable', 'grip'],
    layer: 'physical',
  },
  pedal: {
    material: { roughness: 0.4, metalness: 0.5, color: '#555555' },
    tags: ['metallic', 'interactive'],
    layer: 'physical',
  },
  throttle: {
    material: { roughness: 0.4, metalness: 0.4, color: '#333333' },
    tags: ['interactive', 'mechanical'],
    layer: 'physical',
  },
  slider_control: {
    material: { roughness: 0.3, metalness: 0.4, color: '#888888' },
    tags: ['metallic', 'interactive', 'slidable'],
    layer: 'physical',
  },
  wheel: {
    material: { roughness: 0.5, color: '#2C2C2C' },
    tags: ['rotatable', 'rubber'],
    layer: 'physical',
  },
  pulley: {
    material: { roughness: 0.4, metalness: 0.6, color: '#888888' },
    tags: ['metallic', 'mechanical'],
    layer: 'physical',
  },
  hinge: {
    material: { roughness: 0.4, metalness: 0.7, color: '#888888' },
    tags: ['metallic', 'joint'],
    layer: 'physical',
  },
  latch: {
    material: { roughness: 0.4, metalness: 0.6, color: '#B87333' },
    tags: ['metallic', 'lockable'],
    layer: 'physical',
  },
  spring_loaded: {
    material: { roughness: 0.3, metalness: 0.8, color: '#C0C0C0' },
    tags: ['metallic', 'elastic', 'mechanical'],
    layer: 'physical',
  },
  ratchet: {
    material: { roughness: 0.4, metalness: 0.7, color: '#666666' },
    tags: ['metallic', 'mechanical', 'toothed'],
    layer: 'physical',
  },
  gear_mechanism: {
    material: { roughness: 0.3, metalness: 0.8, color: '#888888' },
    tags: ['metallic', 'mechanical', 'rotatable'],
    layer: 'physical',
  },
  pendulum: {
    material: { roughness: 0.3, metalness: 0.6, color: '#B87333' },
    tags: ['metallic', 'swinging'],
    layer: 'physical',
  },
  balance: {
    material: { roughness: 0.3, metalness: 0.5, color: '#B87333' },
    tags: ['metallic', 'instrument'],
    layer: 'physical',
  },
  fulcrum: {
    material: { roughness: 0.5, metalness: 0.4, color: '#666666' },
    tags: ['structural', 'pivot'],
    layer: 'physical',
  },
  piston: {
    material: { roughness: 0.3, metalness: 0.8, color: '#888888' },
    tags: ['metallic', 'mechanical', 'reciprocating'],
    layer: 'physical',
  },
  bellows: {
    material: { roughness: 0.7, color: '#5C3A1E' },
    tags: ['leather', 'expandable'],
    layer: 'physical',
  },
};
