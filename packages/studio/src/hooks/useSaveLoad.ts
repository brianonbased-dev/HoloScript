'use client';
/**
 * useSaveLoad — Hook for save/load slot management
 */
import { useState, useCallback, useRef } from 'react';
import { SaveManager } from '@holoscript/core';

interface SaveSlot {
  id: string;
  name: string;
  timestamp?: number;
  playtime?: number;
  metadata?: Record<string, unknown>;
}

export interface UseSaveLoadReturn {
  manager: InstanceType<typeof SaveManager>;
  slots: SaveSlot[];
  playtime: number;
  save: (name: string, data?: Record<string, unknown>) => void;
  load: (slotId: string) => Record<string, unknown> | null;
  deleteSlot: (slotId: string) => void;
  exportAll: () => string;
  importAll: (json: string) => number;
  buildDemo: () => void;
  reset: () => void;
}

export function useSaveLoad(): UseSaveLoadReturn {
  const mgr = useRef(new SaveManager({ maxSlots: 10, autosaveInterval: 0 }));
  const [slots, setSlots] = useState<SaveSlot[]>([]);
  const [playtime, setPlaytime] = useState(0);
  const slotCounter = useRef(0);

  const sync = useCallback(() => {
    setSlots(mgr.current.getAllSlots());
    setPlaytime(mgr.current.getPlaytime());
  }, []);

  const save = useCallback(
    (
      name: string,
      data: Record<string, unknown> = {
        scene: 'default',
        entities: Math.floor(Math.random() * 100),
      }
    ) => {
      mgr.current.save(`slot-${slotCounter.current++}`, name, data);
      sync();
    },
    [sync]
  );

  const load = useCallback(
    (slotId: string) => {
      const result = mgr.current.load(slotId);
      sync();
      return result;
    },
    [sync]
  );
  const deleteSlot = useCallback(
    (slotId: string) => {
      mgr.current.deleteSlot(slotId);
      sync();
    },
    [sync]
  );
  const exportAll = useCallback(() => mgr.current.exportAll(), []);
  const importAll = useCallback(
    (json: string) => {
      const count = mgr.current.importAll(json);
      sync();
      return count;
    },
    [sync]
  );

  const buildDemo = useCallback(() => {
    mgr.current = new SaveManager({ maxSlots: 10, autosaveInterval: 0 });
    slotCounter.current = 0;
    mgr.current.save(
      'slot-0',
      'Quick Save',
      { level: 'Tutorial', hp: 100, score: 0 },
      { difficulty: 'normal' }
    );
    mgr.current.save(
      'slot-1',
      'Forest Clearing',
      { level: 'Forest', hp: 85, score: 1250 },
      { difficulty: 'hard' }
    );
    mgr.current.save(
      'slot-2',
      'Boss Fight',
      { level: 'Dungeon', hp: 42, score: 5800 },
      { difficulty: 'nightmare' }
    );
    slotCounter.current = 3;
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    mgr.current = new SaveManager({ maxSlots: 10, autosaveInterval: 0 });
    slotCounter.current = 0;
    sync();
  }, [sync]);

  return {
    manager: mgr.current,
    slots,
    playtime,
    save,
    load,
    deleteSlot,
    exportAll,
    importAll,
    buildDemo,
    reset,
  };
}
