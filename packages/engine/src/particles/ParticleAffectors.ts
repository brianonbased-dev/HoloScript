/**
 * ParticleAffectors.ts
 *
 * Reusable affector functions that modify particles each frame.
 * Plug these into ParticleSystem.addAffector().
 */

import type { Particle } from './ParticleSystem';

/**
 * Gravity: Constant downward acceleration.
 */
export function gravity(strength: number = -9.81): (p: Particle, delta: number) => void {
  return (p, _delta) => {
    p.ay = strength;
  };
}

/**
 * Wind: Constant force in a direction.
 */
export function wind(x: number, y: number, z: number): (p: Particle, delta: number) => void {
  return (p, delta) => {
    p.vx += x * delta;
    p.vy += y * delta;
    p.vz += z * delta;
  };
}

/**
 * Turbulence: Random velocity perturbation based on pseudo-noise.
 */
export function turbulence(strength: number = 1.0): (p: Particle, delta: number) => void {
  return (p, delta) => {
    p.vx += (Math.random() - 0.5) * strength * delta;
    p.vy += (Math.random() - 0.5) * strength * delta;
    p.vz += (Math.random() - 0.5) * strength * delta;
  };
}

/**
 * Drag: Velocity damping (air resistance).
 */
export function drag(coefficient: number = 0.98): (p: Particle, delta: number) => void {
  const factor = Math.pow(coefficient, 60); // Normalize to 60fps
  return (p, delta) => {
    const f = Math.pow(factor, delta * 60);
    p.vx *= f;
    p.vy *= f;
    p.vz *= f;
  };
}

/**
 * Attractor: Pull particles toward a point.
 */
export function attractor(
  x: number,
  y: number,
  z: number,
  strength: number = 5.0,
  minDist: number = 0.1
): (p: Particle, delta: number) => void {
  return (p, delta) => {
    const dx = x - p[0];
    const dy = y - p[1];
    const dz = z - p[2];
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < minDist) return;
    const force = strength / (dist * dist);
    p.vx += (dx / dist) * force * delta;
    p.vy += (dy / dist) * force * delta;
    p.vz += (dz / dist) * force * delta;
  };
}

/**
 * Vortex: Spin particles around an axis.
 */
export function vortex(
  axisX: number,
  axisY: number,
  axisZ: number,
  strength: number = 2.0
): (p: Particle, delta: number) => void {
  // Normalize axis
  const len = Math.sqrt(axisX * axisX + axisY * axisY + axisZ * axisZ) || 1;
  const ax = axisX / len,
    ay = axisY / len,
    az = axisZ / len;

  return (p, delta) => {
    // Cross product: axis × velocity
    const cx = ay * p.vz - az * p.vy;
    const cy = az * p.vx - ax * p.vz;
    const cz = ax * p.vy - ay * p.vx;
    p.vx += cx * strength * delta;
    p.vy += cy * strength * delta;
    p.vz += cz * strength * delta;
  };
}

/**
 * Floor bounce: Bounce particles off a horizontal plane.
 */
export function floorBounce(
  floorY: number = 0,
  bounciness: number = 0.6
): (p: Particle, delta: number) => void {
  return (p, _delta) => {
    if (p[1] <= floorY && p.vy < 0) {
      p[1] = floorY;
      p.vy = -p.vy * bounciness;
    }
  };
}

/**
 * Size oscillation: Pulse size over lifetime.
 */
export function sizeOscillate(
  frequency: number = 3,
  amplitude: number = 0.3
): (p: Particle, delta: number) => void {
  return (p, _delta) => {
    const pulse = Math.sin(p.age * frequency * Math.PI * 2) * amplitude;
    p.size = Math.max(0.001, p.size + pulse * p.size);
  };
}
