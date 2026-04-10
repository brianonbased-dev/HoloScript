import type { TraitVisualConfig } from '../types';

/**
 * Visual configs for healthcare & medical traits (31 traits).
 * Medical equipment, diagnostic tools, surgical instruments, and therapeutic elements.
 */
export const HEALTHCARE_MEDICAL_VISUALS: Record<string, TraitVisualConfig> = {
  patient: { material: { roughness: 0.6 }, tags: ['person', 'medical'], layer: 'mood' },
  vital_signs: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#00FF00', intensity: 0.3 },
    tags: ['display', 'electronic', 'medical'],
    layer: 'visual_effect',
  },
  x_ray_scan: {
    material: { roughness: 0.3 },
    emissive: { color: '#88CCFF', intensity: 0.3 },
    tags: ['medical', 'imaging'],
    layer: 'visual_effect',
  },
  mri_scan: {
    material: { roughness: 0.3, metalness: 0.5, color: '#E8E8E8' },
    tags: ['medical', 'metallic', 'large'],
    layer: 'base_material',
  },
  ct_scan: {
    material: { roughness: 0.3, metalness: 0.4, color: '#E8E8E8' },
    tags: ['medical', 'metallic'],
    layer: 'base_material',
  },
  ultrasound: {
    material: { roughness: 0.4, color: '#333333' },
    emissive: { color: '#44AAFF', intensity: 0.15 },
    tags: ['medical', 'electronic'],
    layer: 'base_material',
  },
  ecg: {
    material: { roughness: 0.3, color: '#111111' },
    emissive: { color: '#00FF00', intensity: 0.3 },
    tags: ['medical', 'electronic', 'display'],
    layer: 'visual_effect',
  },
  surgical_tool: {
    material: { roughness: 0.1, metalness: 0.95, color: '#C0C0C0' },
    tags: ['metallic', 'sharp', 'clean'],
    layer: 'base_material',
  },
  scalpel: {
    material: { roughness: 0.05, metalness: 0.95, color: '#C0C0C0' },
    tags: ['metallic', 'sharp', 'clean'],
    layer: 'base_material',
  },
  forceps: {
    material: { roughness: 0.1, metalness: 0.9, color: '#C0C0C0' },
    tags: ['metallic', 'tool', 'clean'],
    layer: 'base_material',
  },
  syringe: {
    material: { roughness: 0.2, transmission: 0.5, ior: 1.5 },
    tags: ['medical', 'transparent'],
    layer: 'base_material',
  },
  iv_drip: {
    material: { roughness: 0.2, metalness: 0.4, color: '#C0C0C0' },
    tags: ['medical', 'metallic'],
    layer: 'base_material',
  },
  defibrillator: {
    material: { roughness: 0.3, color: '#FF4444' },
    emissive: { color: '#FF0000', intensity: 0.2 },
    tags: ['medical', 'electronic', 'emergency'],
    layer: 'base_material',
  },
  stethoscope: {
    material: { roughness: 0.3, metalness: 0.5, color: '#333333' },
    tags: ['medical', 'metallic'],
    layer: 'base_material',
  },
  bandage: {
    material: { roughness: 0.8, color: '#F5F5F5' },
    tags: ['medical', 'fabric'],
    layer: 'base_material',
  },
  splint: {
    material: { roughness: 0.6, color: '#E8DCC8' },
    tags: ['medical', 'rigid'],
    layer: 'base_material',
  },
  wheelchair: {
    material: { roughness: 0.3, metalness: 0.6, color: '#333333' },
    tags: ['medical', 'metallic', 'mobility'],
    layer: 'base_material',
  },
  prosthetic: {
    material: { roughness: 0.3, metalness: 0.5, color: '#D2A679' },
    tags: ['medical', 'wearable'],
    layer: 'base_material',
  },
  therapeutic: {
    material: { roughness: 0.4 },
    emissive: { color: '#88DDAA', intensity: 0.15 },
    tags: ['healing', 'calming'],
    layer: 'mood',
  },
  meditation: {
    material: { roughness: 0.4 },
    emissive: { color: '#88AAFF', intensity: 0.15 },
    tags: ['calming', 'spiritual'],
    layer: 'mood',
  },
  breathing_exercise: {
    material: { roughness: 0.4 },
    emissive: { color: '#88DDCC', intensity: 0.1 },
    tags: ['calming', 'animated'],
    layer: 'mood',
  },
  biofeedback: {
    material: { roughness: 0.3 },
    emissive: { color: '#44FF88', intensity: 0.2 },
    tags: ['electronic', 'medical', 'display'],
    layer: 'visual_effect',
  },
  exposure_therapy: {
    material: { roughness: 0.5 },
    tags: ['therapeutic', 'interactive'],
    layer: 'mood',
  },
  pain_management: {
    material: { roughness: 0.4 },
    emissive: { color: '#66CCAA', intensity: 0.15 },
    tags: ['therapeutic', 'calming'],
    layer: 'mood',
  },
  rehabilitation: {
    material: { roughness: 0.5 },
    emissive: { color: '#44CC88', intensity: 0.1 },
    tags: ['therapeutic', 'active'],
    layer: 'mood',
  },
  cognitive_therapy: {
    material: { roughness: 0.4 },
    emissive: { color: '#88AAFF', intensity: 0.1 },
    tags: ['therapeutic', 'mental'],
    layer: 'mood',
  },
  phobia_treatment: {
    material: { roughness: 0.5 },
    tags: ['therapeutic', 'exposure'],
    layer: 'mood',
  },
  ptsd_therapy: {
    material: { roughness: 0.5 },
    emissive: { color: '#88DDAA', intensity: 0.1 },
    tags: ['therapeutic', 'sensitive'],
    layer: 'mood',
  },
  mindfulness: {
    material: { roughness: 0.4 },
    emissive: { color: '#88CCDD', intensity: 0.15 },
    tags: ['calming', 'spiritual'],
    layer: 'mood',
  },
  body_scan: {
    material: { roughness: 0.3 },
    emissive: { color: '#44AAFF', intensity: 0.2 },
    tags: ['medical', 'imaging'],
    layer: 'visual_effect',
  },
  guided_relaxation: {
    material: { roughness: 0.4 },
    emissive: { color: '#88DDBB', intensity: 0.15 },
    tags: ['calming', 'audio'],
    layer: 'mood',
  },
};
