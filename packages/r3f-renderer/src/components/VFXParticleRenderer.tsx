/**
 * VFXParticleRenderer — GPU billboard particles for visual effects.
 *
 * Renders fire, smoke, sparks, dust, rain, snow, and custom VFX particles
 * using billboard point sprites with size/color curves over lifetime.
 * Separate from physics @particle — this is purely visual VFX.
 *
 * @see W.265: VFX particles distinct from physics particles
 * @see P.RENDER.007: Physics-to-Rendering Bridge pattern
 */

import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export type VFXPreset = 'fire' | 'smoke' | 'sparks' | 'dust' | 'rain' | 'snow' | 'custom';
export type EmitterShape = 'point' | 'sphere' | 'cone' | 'box';

export interface VFXParticleRendererProps {
  /** VFX preset (default: 'fire') */
  preset?: VFXPreset;
  /** Maximum particle count (default: 10000) */
  maxParticles?: number;
  /** Emission rate (particles/second, default: 100) */
  emissionRate?: number;
  /** Particle lifetime in seconds (default: 2.0) */
  lifetime?: number;
  /** Emitter shape (default: 'point') */
  emitterShape?: EmitterShape;
  /** Emitter radius for sphere/cone shapes (default: 1.0) */
  emitterRadius?: number;
  /** Initial velocity direction [x, y, z] (default: [0, 1, 0]) */
  velocity?: [number, number, number];
  /** Velocity randomness 0-1 (default: 0.3) */
  velocitySpread?: number;
  /** Initial particle size (default: 0.5) */
  startSize?: number;
  /** End particle size (default: 0.0) */
  endSize?: number;
  /** Start color */
  startColor?: string;
  /** End color */
  endColor?: string;
  /** Start opacity (default: 1.0) */
  startOpacity?: number;
  /** End opacity (default: 0.0) */
  endOpacity?: number;
  /** Gravity [x, y, z] (default: [0, -9.81, 0]) */
  gravity?: [number, number, number];
  /** Blending mode */
  blending?: THREE.Blending;
  /** Whether emitter is active */
  active?: boolean;
  /** Group position offset */
  position?: [number, number, number];
}

// ── Preset Configurations ────────────────────────────────────────────────────

const PRESETS: Record<VFXPreset, Partial<VFXParticleRendererProps>> = {
  fire: {
    startColor: '#ff6600', endColor: '#330000',
    startSize: 0.8, endSize: 0.1,
    velocity: [0, 3, 0], velocitySpread: 0.4,
    lifetime: 1.5, gravity: [0, 1, 0],
    startOpacity: 0.9, endOpacity: 0.0,
  },
  smoke: {
    startColor: '#444444', endColor: '#888888',
    startSize: 0.3, endSize: 2.0,
    velocity: [0, 1.5, 0], velocitySpread: 0.5,
    lifetime: 4.0, gravity: [0, 0.5, 0],
    startOpacity: 0.5, endOpacity: 0.0,
  },
  sparks: {
    startColor: '#ffcc00', endColor: '#ff4400',
    startSize: 0.15, endSize: 0.02,
    velocity: [0, 5, 0], velocitySpread: 0.8,
    lifetime: 1.0, gravity: [0, -9.81, 0],
    startOpacity: 1.0, endOpacity: 0.0,
  },
  dust: {
    startColor: '#c4a882', endColor: '#c4a882',
    startSize: 0.05, endSize: 0.15,
    velocity: [0.5, 0.2, 0.3], velocitySpread: 0.6,
    lifetime: 5.0, gravity: [0, -0.1, 0],
    startOpacity: 0.3, endOpacity: 0.0,
  },
  rain: {
    startColor: '#aaccff', endColor: '#aaccff',
    startSize: 0.02, endSize: 0.02,
    velocity: [0, -15, 0], velocitySpread: 0.1,
    lifetime: 2.0, gravity: [0, -9.81, 0],
    startOpacity: 0.6, endOpacity: 0.3,
  },
  snow: {
    startColor: '#ffffff', endColor: '#ffffff',
    startSize: 0.08, endSize: 0.08,
    velocity: [0, -1.5, 0], velocitySpread: 0.5,
    lifetime: 8.0, gravity: [0, -0.3, 0],
    startOpacity: 0.8, endOpacity: 0.2,
  },
  custom: {},
};

// ── Shaders ──────────────────────────────────────────────────────────────────

const VFX_VERT = /* glsl */ `
attribute float aLife;
attribute vec3 aVelocity;

uniform float uTime;
uniform float uLifetime;
uniform float uStartSize;
uniform float uEndSize;
uniform vec3 uGravity;

varying float vLife;

void main() {
  vLife = aLife;

  float age = mod(uTime - aLife, uLifetime);
  float normalizedAge = age / uLifetime;

  if (normalizedAge < 0.0 || normalizedAge > 1.0) {
    gl_Position = vec4(0.0, 0.0, -999.0, 1.0);
    gl_PointSize = 0.0;
    return;
  }

  vec3 pos = position + aVelocity * age + 0.5 * uGravity * age * age;
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_Position = projectionMatrix * mvPosition;

  float size = mix(uStartSize, uEndSize, normalizedAge);
  gl_PointSize = size * (300.0 / -mvPosition.z);
}
`;

const VFX_FRAG = /* glsl */ `
uniform vec3 uStartColor;
uniform vec3 uEndColor;
uniform float uStartOpacity;
uniform float uEndOpacity;
uniform float uLifetime;
uniform float uTime;

varying float vLife;

void main() {
  vec2 cxy = 2.0 * gl_PointCoord - 1.0;
  float r2 = dot(cxy, cxy);
  if (r2 > 1.0) discard;

  float age = mod(uTime - vLife, uLifetime);
  float t = clamp(age / uLifetime, 0.0, 1.0);

  vec3 color = mix(uStartColor, uEndColor, t);
  float opacity = mix(uStartOpacity, uEndOpacity, t);
  opacity *= 1.0 - r2 * 0.5;

  gl_FragColor = vec4(color, opacity);
}
`;

// ── Component ────────────────────────────────────────────────────────────────

export function VFXParticleRenderer(props: VFXParticleRendererProps) {
  const {
    preset = 'fire',
    maxParticles = 10000,
    active = true,
    position = [0, 0, 0],
  } = props;

  const presetDefaults = PRESETS[preset];
  const merged = { ...presetDefaults, ...props };

  const {
    lifetime = 2.0,
    velocity = [0, 1, 0],
    velocitySpread = 0.3,
    startSize = 0.5,
    endSize = 0.0,
    startColor = '#ffffff',
    endColor = '#000000',
    startOpacity = 1.0,
    endOpacity = 0.0,
    gravity = [0, -9.81, 0],
    blending,
  } = merged;

  const pointsRef = useRef<THREE.Points>(null);
  const timeRef = useRef(0);

  const startCol = useMemo(() => new THREE.Color(startColor), [startColor]);
  const endCol = useMemo(() => new THREE.Color(endColor), [endColor]);
  const gravVec = useMemo(() => new THREE.Vector3(...gravity), [gravity]);

  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(maxParticles * 3);
    const lives = new Float32Array(maxParticles);
    const velocities = new Float32Array(maxParticles * 3);

    for (let i = 0; i < maxParticles; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 0.1;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 0.1;

      lives[i] = -Math.random() * lifetime;

      velocities[i * 3] = velocity[0] + (Math.random() - 0.5) * velocitySpread * Math.max(Math.abs(velocity[0]), 1);
      velocities[i * 3 + 1] = velocity[1] + (Math.random() - 0.5) * velocitySpread * Math.max(Math.abs(velocity[1]), 1);
      velocities[i * 3 + 2] = velocity[2] + (Math.random() - 0.5) * velocitySpread * Math.max(Math.abs(velocity[2]), 1);
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    geo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));

    return geo;
  }, [maxParticles, lifetime, velocity, velocitySpread]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uLifetime: { value: lifetime },
      uStartSize: { value: startSize },
      uEndSize: { value: endSize },
      uGravity: { value: gravVec },
      uStartColor: { value: startCol },
      uEndColor: { value: endCol },
      uStartOpacity: { value: startOpacity },
      uEndOpacity: { value: endOpacity },
    }),
    [lifetime, startSize, endSize, gravVec, startCol, endCol, startOpacity, endOpacity],
  );

  useFrame((_, delta) => {
    if (!active) return;
    timeRef.current += delta;
    uniforms.uTime.value = timeRef.current;
  });

  const blendMode = blending ?? (
    preset === 'smoke' || preset === 'dust'
      ? THREE.NormalBlending
      : THREE.AdditiveBlending
  );

  if (!active) return null;

  return (
    <group position={position}>
      <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
        <shaderMaterial
          vertexShader={VFX_VERT}
          fragmentShader={VFX_FRAG}
          uniforms={uniforms}
          transparent
          depthWrite={false}
          blending={blendMode}
        />
      </points>
    </group>
  );
}
