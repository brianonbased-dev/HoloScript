'use client';
/**
 * useSceneManager — Hook for scene save/load management
 */
import { useState, useCallback, useRef } from 'react';
import { SceneManager, type SceneListEntry } from '@holoscript/core';

export interface UseSceneManagerReturn {
  scenes: SceneListEntry[];
  count: number;
  save: (name: string) => void;
  load: (name: string) => boolean;
  deleteScene: (name: string) => void;
  exportJSON: (name: string) => string | null;
  buildDemo: () => void;
  reset: () => void;
}

export function useSceneManager(): UseSceneManagerReturn {
  const mgr = useRef(new SceneManager());
  const [scenes, setScenes] = useState<SceneListEntry[]>([]);

  const sync = useCallback(() => {
    setScenes(mgr.current.list());
  }, []);

  const save = useCallback(
    (name: string) => {
      const demoNode = {
        type: 'root',
        name,
        traits: {},
        children: [
          {
            type: 'entity',
            name: 'Player',
            traits: { transform: { pos: [0, 1, 0] } },
            children: [],
          },
          { type: 'entity', name: 'Ground', traits: { mesh: { type: 'plane' } }, children: [] },
          {
            type: 'entity',
            name: 'Light',
            traits: { light: { type: 'directional' } },
            children: [],
          },
        ],
      };
      mgr.current.save(name, demoNode as unknown as Parameters<typeof mgr.current.save>[1]);
      sync();
    },
    [sync]
  );

  const load = useCallback((name: string) => {
    const result = mgr.current.load(name);
    return result !== null;
  }, []);

  const deleteScene = useCallback(
    (name: string) => {
      mgr.current.delete(name);
      sync();
    },
    [sync]
  );
  const exportJSON = useCallback((name: string) => mgr.current.exportJSON(name), []);

  const buildDemo = useCallback(() => {
    mgr.current = new SceneManager();
    save('Main Level');
    save('Tutorial Zone');
    save('Boss Arena');
    sync();
  }, [save, sync]);

  const reset = useCallback(() => {
    mgr.current = new SceneManager();
    sync();
  }, [sync]);

  return { scenes, count: scenes.length, save, load, deleteScene, exportJSON, buildDemo, reset };
}
