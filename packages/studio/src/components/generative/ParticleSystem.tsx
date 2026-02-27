'use client';

/**
 * ParticleSystem — GPU particle system for Generative Art mode.
 *
 * Uses a Points object with BufferGeometry. Positions are animated
 * each frame by a CPU-side velocity integration (fast enough for
 * counts up to ~50k on modern hardware; GPGPU shader is a future upgrade).
 *
 * Props match GenerativePreset.particles.
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface ParticleSystemProps {
  count: number;
  speed: number;
  spread: number;
  colorA: string;
  colorB: string;
  lifetime: number;
}

export function ParticleSystem({
  count,
  speed,
  spread,
  colorA,
  colorB,
  lifetime,
}: ParticleSystemProps) {
  const pointsRef = useRef<THREE.Points>(null);

  // Pre-allocate typed arrays — one-time init per prop change
  const { positions, velocities, ages, lifetimes, colors } = useMemo(() => {
    const positions  = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const ages       = new Float32Array(count);
    const lifetimes  = new Float32Array(count);
    const colors     = new Float32Array(count * 3);

    const ca = new THREE.Color(colorA);
    const cb = new THREE.Color(colorB);

    for (let i = 0; i < count; i++) {
      const t = Math.random();
      const mixed = ca.clone().lerp(cb, t);
      colors[i * 3]     = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;

      // Random sphere distribution
      const theta = Math.random() * Math.PI * 2;
      const phi   = Math.acos(2 * Math.random() - 1);
      const r     = spread * Math.cbrt(Math.random()); // cube root → uniform volume
      positions[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      // Random initial velocity
      velocities[i * 3]     = (Math.random() - 0.5) * speed;
      velocities[i * 3 + 1] = Math.random() * speed * 0.5;
      velocities[i * 3 + 2] = (Math.random() - 0.5) * speed;

      ages[i]      = Math.random() * lifetime; // stagger birth
      lifetimes[i] = lifetime * (0.5 + Math.random() * 0.5);
    }
    return { positions, velocities, ages, lifetimes, colors };
  }, [count, speed, spread, colorA, colorB, lifetime]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors, 3));
    return geo;
  }, [positions, colors]);

  useFrame((_, delta) => {
    const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < count; i++) {
      ages[i] += delta;
      const life = lifetimes[i];
      if (ages[i] > life) {
        // Respawn at origin with slight spread
        ages[i] = 0;
        positions[i * 3]     = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 0.2;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 0.2;
        velocities[i * 3]     = (Math.random() - 0.5) * speed;
        velocities[i * 3 + 1] = Math.random() * speed * 0.5;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * speed;
      } else {
        // Integrate position
        positions[i * 3]     += velocities[i * 3]     * delta;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * delta;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * delta;
        // Dampen
        velocities[i * 3]     *= 0.999;
        velocities[i * 3 + 1] *= 0.999;
        velocities[i * 3 + 2] *= 0.999;
      }
    }
    (posAttr.array as Float32Array).set(positions);
    posAttr.needsUpdate = true;
  });

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={0.035}
        vertexColors
        transparent
        opacity={0.85}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}
