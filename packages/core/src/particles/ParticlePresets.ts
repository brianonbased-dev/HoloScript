/**
 * ParticlePresets.ts
 *
 * Ready-to-use particle emitter configurations for common visual effects.
 */

import type { EmitterConfig, Color4 } from './ParticleSystem';

const WHITE: Color4 = { r: 1, g: 1, b: 1, a: 1 };
const TRANSPARENT: Color4 = { r: 1, g: 1, b: 1, a: 0 };

export const ParticlePresets: Record<string, EmitterConfig> = {
  /** Ambient floating dust motes */
  dust: {
    shape: 'box',
    rate: 5,
    maxParticles: 80,
    lifetime: [4, 8],
    speed: [0.01, 0.03],
    size: [0.003, 0.008],
    sizeEnd: [0.001, 0.003],
    colorStart: { r: 0.9, g: 0.85, b: 0.7, a: 0.4 },
    colorEnd: { r: 0.9, g: 0.85, b: 0.7, a: 0 },
    position: { x: 0, y: 1, z: 0 },
    radius: 2,
    direction: { x: 0, y: 0.2, z: 0 },
  },

  /** Sparks flying upward */
  sparks: {
    shape: 'cone',
    rate: 30,
    maxParticles: 200,
    lifetime: [0.3, 1.0],
    speed: [1.5, 4.0],
    size: [0.005, 0.015],
    sizeEnd: [0.001, 0.003],
    colorStart: { r: 1, g: 0.8, b: 0.2, a: 1 },
    colorEnd: { r: 1, g: 0.3, b: 0, a: 0 },
    position: { x: 0, y: 0, z: 0 },
    coneAngle: Math.PI / 8,
    direction: { x: 0, y: 1, z: 0 },
  },

  /** Flame / fire effect */
  fire: {
    shape: 'cone',
    rate: 40,
    maxParticles: 150,
    lifetime: [0.5, 1.5],
    speed: [0.3, 0.8],
    size: [0.03, 0.08],
    sizeEnd: [0.01, 0.02],
    colorStart: { r: 1, g: 0.6, b: 0.1, a: 0.9 },
    colorEnd: { r: 0.8, g: 0.1, b: 0, a: 0 },
    position: { x: 0, y: 0, z: 0 },
    coneAngle: Math.PI / 10,
    direction: { x: 0, y: 1, z: 0 },
  },

  /** Confetti burst (use with burst() method) */
  confetti: {
    shape: 'sphere',
    rate: 0, // Manual burst only
    burst: 50,
    maxParticles: 100,
    lifetime: [2, 4],
    speed: [2, 5],
    size: [0.01, 0.025],
    sizeEnd: [0.01, 0.025],
    colorStart: { r: 1, g: 0.2, b: 0.5, a: 1 },
    colorEnd: { r: 0.2, g: 0.5, b: 1, a: 0.5 },
    position: { x: 0, y: 1, z: 0 },
    radius: 0.1,
    rotationSpeed: [-5, 5],
  },

  /** Snow */
  snow: {
    shape: 'box',
    rate: 15,
    maxParticles: 300,
    lifetime: [5, 10],
    speed: [0.1, 0.3],
    size: [0.005, 0.015],
    sizeEnd: [0.003, 0.01],
    colorStart: { r: 1, g: 1, b: 1, a: 0.8 },
    colorEnd: { r: 1, g: 1, b: 1, a: 0 },
    position: { x: 0, y: 3, z: 0 },
    radius: 3,
    direction: { x: 0, y: -1, z: 0 },
    rotationSpeed: [-1, 1],
  },

  /** UI haptic feedback pulse (tiny, fast) */
  hapticPulse: {
    shape: 'sphere',
    rate: 0,
    burst: 12,
    maxParticles: 30,
    lifetime: [0.15, 0.35],
    speed: [0.3, 0.8],
    size: [0.002, 0.006],
    sizeEnd: [0, 0],
    colorStart: { r: 0.3, g: 0.6, b: 1, a: 0.9 },
    colorEnd: { r: 0.3, g: 0.6, b: 1, a: 0 },
    position: { x: 0, y: 0, z: 0 },
    radius: 0.01,
  },

  /** Smoke */
  smoke: {
    shape: 'cone',
    rate: 10,
    maxParticles: 100,
    lifetime: [2, 5],
    speed: [0.1, 0.4],
    size: [0.03, 0.06],
    sizeEnd: [0.08, 0.15],
    colorStart: { r: 0.4, g: 0.4, b: 0.4, a: 0.5 },
    colorEnd: { r: 0.6, g: 0.6, b: 0.6, a: 0 },
    position: { x: 0, y: 0, z: 0 },
    coneAngle: Math.PI / 12,
    direction: { x: 0, y: 1, z: 0 },
  },
};
