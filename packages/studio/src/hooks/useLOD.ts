// @ts-nocheck
'use client';
/**
 * useLOD — Hook for LOD management and visualization
 */
import { useState, useCallback, useRef } from 'react';
import { LODManager } from '@holoscript/core';

export interface LODObjectState {
  id: string;
  level: number;
  distance: number;
  transitioning: boolean;
}

export interface UseLODReturn {
  manager: InstanceType<typeof LODManager>;
  objects: LODObjectState[];
  cameraPos: [number, number, number];
  setCameraPos: (pos: [number, number, number]) => void;
  buildDemo: () => void;
  update: () => void;
  reset: () => void;
}

export function useLOD(): UseLODReturn {
  const mgrRef = useRef(new LODManager({ autoUpdate: false, collectMetrics: true }));
  const [objects, setObjects] = useState<LODObjectState[]>([]);
  const [cameraPos, setCameraPosState] = useState<[number, number, number]>([0, 0, 0]);

  const sync = useCallback(() => {
    const ids = mgrRef.current.getRegisteredObjects();
    const states: LODObjectState[] = ids.map((id) => ({
      id,
      level: mgrRef.current.getCurrentLevel(id),
      distance: 0,
      transitioning: mgrRef.current.isTransitioning(id),
    }));
    setObjects(states);
  }, []);

  const setCameraPos = useCallback(
    (pos: [number, number, number]) => {
      mgrRef.current.setCameraPosition(pos);
      setCameraPosState(pos);
      mgrRef.current.update(0.016);
      sync();
    },
    [sync]
  );

  const buildDemo = useCallback(() => {
    mgrRef.current = new LODManager({ autoUpdate: false, collectMetrics: true });
    const demoObjects = [
      { id: 'tree-01', pos: [10, 0, 0] as [number, number, number] },
      { id: 'rock-01', pos: [25, 0, 5] as [number, number, number] },
      { id: 'building-01', pos: [50, 0, -10] as [number, number, number] },
      { id: 'character-01', pos: [5, 0, 3] as [number, number, number] },
      { id: 'vehicle-01', pos: [100, 0, 0] as [number, number, number] },
    ];
    for (const obj of demoObjects) {
      mgrRef.current.register(
        obj.id,
        {
          levels: [
            {
              level: 0,
              distance: 0,
              triangleCount: 10000,
              polygonRatio: 1.0,
              textureScale: 1.0,
              disabledFeatures: [],
            },
            {
              level: 1,
              distance: 20,
              triangleCount: 5000,
              polygonRatio: 0.5,
              textureScale: 0.75,
              disabledFeatures: [],
            },
            {
              level: 2,
              distance: 50,
              triangleCount: 1000,
              polygonRatio: 0.1,
              textureScale: 0.5,
              disabledFeatures: [],
            },
            {
              level: 3,
              distance: 100,
              triangleCount: 200,
              polygonRatio: 0.02,
              textureScale: 0.25,
              disabledFeatures: [],
            },
          ],
        } as any,
        obj.pos
      );
    }
    mgrRef.current.setCameraPosition([0, 0, 0]);
    mgrRef.current.update(0.016);
    sync();
  }, [sync]);

  const update = useCallback(() => {
    mgrRef.current.update(0.016);
    sync();
  }, [sync]);
  const reset = useCallback(() => {
    mgrRef.current = new LODManager({ autoUpdate: false, collectMetrics: true });
    sync();
  }, [sync]);

  return { manager: mgrRef.current, objects, cameraPos, setCameraPos, buildDemo, update, reset };
}
