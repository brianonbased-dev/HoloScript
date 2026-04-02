// @ts-nocheck
'use client';
/**
 * useLighting — Hook for scene lighting management
 */
import { useState, useCallback, useRef } from 'react';
import { LightingModel } from '@holoscript/core';

export interface UseLightingReturn {
  model: InstanceType<typeof LightingModel>;
  lights: Light[];
  ambient: AmbientConfig;
  addLight: (type: LightType, name?: string) => Light;
  removeLight: (id: string) => void;
  toggleLight: (id: string) => void;
  setAmbient: (config: Partial<AmbientConfig>) => void;
  buildDemoScene: () => void;
  reset: () => void;
}

type LightType = 'directional' | 'point' | 'spot' | 'area' | 'probe';

interface Light {
  id: string;
  type: LightType;
  enabled?: boolean;
  color: [number, number, number];
  intensity: number;
  position?: [number, number, number] | { x: number; y: number; z: number };
  direction?: [number, number, number];
  castShadow?: boolean;
  range?: number;
  angle?: number;
  spotAngle?: number;
  penumbra?: number;
  width?: number;
  height?: number;
}

interface AmbientConfig {
  enabled?: boolean;
  color: number[];
  intensity: number;
  skyColor?: number[];
  groundColor?: number[];
  useHemisphere?: boolean;
}
export function useLighting(): UseLightingReturn {
  const modelRef = useRef(new LightingModel());
  const [lights, setLights] = useState<Light[]>([]);
  const [ambient, setAmbientState] = useState<AmbientConfig>(modelRef.current.getAmbient());
  const idCounter = useRef(0);

  const sync = useCallback(() => {
    // Collect all lights from model
    const allLights: Light[] = [];
    for (let i = 0; i < 200; i++) {
      const l = modelRef.current.getLight(`light-${i}`);
      if (l) allLights.push(l);
    }
    // Also check demo light ids
    for (const id of ['sun', 'fill', 'rim', 'spot-accent']) {
      const l = modelRef.current.getLight(id);
      if (l && !allLights.find((a) => a.id === id)) allLights.push(l);
    }
    setLights(allLights);
    setAmbientState(modelRef.current.getAmbient());
  }, []);

  const addLight = useCallback(
    (type: LightType, name?: string) => {
      const id = name ?? `light-${idCounter.current++}`;
      const pos = {
        x: Math.random() * 20 - 10,
        y: 5 + Math.random() * 10,
        z: Math.random() * 20 - 10,
      };
      const colors: Record<LightType, [number, number, number]> = {
        directional: [1, 0.95, 0.8],
        point: [1, 0.8, 0.4],
        spot: [0.6, 0.8, 1],
        area: [0.9, 0.9, 1.0],
        probe: [0.5, 0.7, 1.0],
      };
      const light = modelRef.current.addLight({
        id,
        type: type as 'directional' | 'point' | 'spot',
        position: pos,
        color: colors[type],
        intensity: type === 'directional' ? 1.2 : 2.0,
      });
      sync();
      return light;
    },
    [sync]
  );

  const removeLight = useCallback(
    (id: string) => {
      modelRef.current.removeLight(id);
      sync();
    },
    [sync]
  );
  const toggleLight = useCallback(
    (id: string) => {
      const l = modelRef.current.getLight(id);
      if (l) {
        modelRef.current.enableLight(id, !l.enabled);
        sync();
      }
    },
    [sync]
  );

  const setAmbient = useCallback(
    (config: Partial<AmbientConfig>) => {
      modelRef.current.setAmbient(config);
      sync();
    },
    [sync]
  );

  const buildDemoScene = useCallback(() => {
    modelRef.current = new LightingModel();
    idCounter.current = 0;
    modelRef.current.addLight({
      id: 'sun',
      type: 'directional',
      color: [1, 0.95, 0.85],
      intensity: 1.5,
      castShadow: true,
      direction: { x: -0.5, y: -1, z: -0.3 },
    });
    modelRef.current.addLight({
      id: 'fill',
      type: 'point',
      color: [0.4, 0.6, 1],
      intensity: 0.8,
      position: { x: -5, y: 3, z: 5 },
      range: 20,
    });
    modelRef.current.addLight({
      id: 'rim',
      type: 'point',
      color: [1, 0.5, 0.2],
      intensity: 1.2,
      position: { x: 8, y: 6, z: -3 },
      range: 15,
    });
    modelRef.current.addLight({
      id: 'spot-accent',
      type: 'spot',
      color: [0.8, 1, 0.6],
      intensity: 3,
      position: { x: 0, y: 10, z: 0 },
      spotAngle: 30,
      range: 25,
      castShadow: true,
    });
    modelRef.current.setAmbient({
      color: [0.05, 0.05, 0.1],
      intensity: 0.2,
      skyColor: [0.3, 0.4, 0.7],
      groundColor: [0.15, 0.1, 0.08],
      useHemisphere: true,
    });
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    modelRef.current = new LightingModel();
    idCounter.current = 0;
    sync();
  }, [sync]);

  return {
    model: modelRef.current,
    lights,
    ambient,
    addLight,
    removeLight,
    toggleLight,
    setAmbient,
    buildDemoScene,
    reset,
  };
}
