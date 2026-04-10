'use client';
/**
 * useParticles — Hook for particle system preview and editing
 */
import { useState, useCallback, useRef } from 'react';
import { ParticleSystem } from '@/lib/core-stubs';

interface Color4 {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface EmitterConfig {
  shape: 'point' | 'cone' | 'box' | 'sphere';
  rate: number;
  maxParticles: number;
  lifetime: [number, number];
  speed: [number, number];
  size: [number, number];
  sizeEnd: [number, number];
  colorStart: Color4;
  colorEnd: Color4;
  position: { x: number; y: number; z: number };
  direction?: { x: number; y: number; z: number };
  coneAngle?: number;
}

const PRESETS: Record<string, Partial<EmitterConfig>> = {
  fire: {
    shape: 'cone',
    rate: 80,
    maxParticles: 500,
    lifetime: [0.3, 1.0],
    speed: [2, 5],
    size: [0.3, 0.6],
    sizeEnd: [0, 0.1],
    colorStart: { r: 1, g: 0.6, b: 0.1, a: 1 },
    colorEnd: { r: 1, g: 0, b: 0, a: 0 },
    position: { x: 0, y: 0, z: 0 },
    coneAngle: 20,
  },
  snow: {
    shape: 'box',
    rate: 30,
    maxParticles: 300,
    lifetime: [3, 6],
    speed: [0.5, 1.5],
    size: [0.05, 0.15],
    sizeEnd: [0.05, 0.1],
    colorStart: { r: 1, g: 1, b: 1, a: 0.9 },
    colorEnd: { r: 0.8, g: 0.9, b: 1, a: 0.2 },
    position: { x: 0, y: 10, z: 0 },
    direction: { x: 0, y: -1, z: 0 },
  },
  sparks: {
    shape: 'point',
    rate: 120,
    maxParticles: 400,
    lifetime: [0.1, 0.5],
    speed: [8, 15],
    size: [0.02, 0.05],
    sizeEnd: [0, 0],
    colorStart: { r: 1, g: 0.9, b: 0.4, a: 1 },
    colorEnd: { r: 1, g: 0.3, b: 0, a: 0 },
    position: { x: 0, y: 0, z: 0 },
  },
  smoke: {
    shape: 'sphere',
    rate: 15,
    maxParticles: 150,
    lifetime: [2, 5],
    speed: [0.5, 2],
    size: [0.5, 1],
    sizeEnd: [2, 3],
    colorStart: { r: 0.5, g: 0.5, b: 0.5, a: 0.6 },
    colorEnd: { r: 0.3, g: 0.3, b: 0.3, a: 0 },
    position: { x: 0, y: 0, z: 0 },
  },
};

const DEFAULT_CONFIG: EmitterConfig = {
  shape: 'point',
  rate: 50,
  maxParticles: 200,
  lifetime: [1, 3],
  speed: [1, 4],
  size: [0.1, 0.3],
  sizeEnd: [0, 0.1],
  colorStart: { r: 1, g: 1, b: 1, a: 1 },
  colorEnd: { r: 1, g: 1, b: 1, a: 0 },
  position: { x: 0, y: 0, z: 0 },
};

export interface UseParticlesReturn {
  system: InstanceType<typeof ParticleSystem>;
  activeCount: number;
  isEmitting: boolean;
  presetNames: string[];
  particles: Array<{
    x: number;
    y: number;
    z: number;
    size: number;
    color: Color4;
    age: number;
    lifetime: number;
  }>;
  loadPreset: (name: string) => void;
  toggleEmitting: () => void;
  burst: (count?: number) => void;
  step: (dt?: number) => void;
  reset: () => void;
}

export function useParticles(): UseParticlesReturn {
  const sysRef = useRef(new ParticleSystem(DEFAULT_CONFIG));
  const [activeCount, setActiveCount] = useState(0);
  const [isEmitting, setIsEmitting] = useState(true);
  const [particles, setParticles] = useState<UseParticlesReturn['particles']>([]);

  const sync = useCallback(() => {
    const alive = sysRef.current.getAliveParticles();
    setActiveCount(sysRef.current.getActiveCount());
    setIsEmitting(sysRef.current.isEmitting());
    setParticles(
      alive.map(
        (p: {
          x: number;
          y: number;
          z: number;
          size: number;
          color: Color4;
          age: number;
          lifetime: number;
        }) => ({
          x: p.x,
          y: p.y,
          z: p.z,
          size: p.size,
          color: p.color,
          age: p.age,
          lifetime: p.lifetime,
        })
      )
    );
  }, []);

  const loadPreset = useCallback(
    (name: string) => {
      const preset = PRESETS[name];
      if (!preset) return;
      sysRef.current = new ParticleSystem({ ...DEFAULT_CONFIG, ...preset } as EmitterConfig);
      sync();
    },
    [sync]
  );

  const toggleEmitting = useCallback(() => {
    sysRef.current.setEmitting(!sysRef.current.isEmitting());
    sync();
  }, [sync]);

  const burst = useCallback(
    (count = 20) => {
      sysRef.current.burst(count);
      sync();
    },
    [sync]
  );
  const step = useCallback(
    (dt = 1 / 60) => {
      sysRef.current.update(dt);
      sync();
    },
    [sync]
  );

  const reset = useCallback(() => {
    sysRef.current = new ParticleSystem(DEFAULT_CONFIG);
    sync();
  }, [sync]);

  return {
    system: sysRef.current,
    activeCount,
    isEmitting,
    presetNames: Object.keys(PRESETS),
    particles,
    loadPreset,
    toggleEmitting,
    burst,
    step,
    reset,
  };
}
