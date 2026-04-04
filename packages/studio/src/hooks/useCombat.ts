// @ts-nocheck
'use client';
/**
 * useCombat — Hook for combat system editing and simulation
 */
import { useState, useCallback, useRef } from 'react';
import { CombatManager } from '@holoscript/core';

type CombatManagerInstance = InstanceType<typeof CombatManager>;
export interface ComboChain {
  id: string;
  steps: Array<{ name: string; [key: string]: unknown }>;
  currentStep: number;
  completed: boolean;
}

export interface CombatEntity {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  position: { x: number; y: number; z: number };
  hitboxId?: string;
  hurtboxId?: string;
}

export interface UseCombatReturn {
  manager: CombatManagerInstance;
  entities: CombatEntity[];
  combos: ComboChain[];
  hitLog: Array<{ hitboxId: string; hurtboxId: string; time: number }>;
  spawnEntity: (name: string) => void;
  attack: (attackerId: string, targetId: string) => void;
  registerCombo: (name: string) => void;
  advanceCombo: (comboId: string, input: string) => { hit: boolean; completed: boolean };
  tick: (dt?: number) => void;
  reset: () => void;
}

export function useCombat(): UseCombatReturn {
  const mgrRef = useRef(new CombatManager());
  const [entities, setEntities] = useState<CombatEntity[]>([]);
  const [combos, setCombos] = useState<ComboChain[]>([]);
  const [hitLog, setHitLog] = useState<
    Array<{ hitboxId: string; hurtboxId: string; time: number }>
  >([]);
  const idCounter = useRef(0);

  const sync = useCallback(() => {
    setHitLog(mgrRef.current.getHitLog());
  }, []);

  const spawnEntity = useCallback((name: string) => {
    const id = `entity-${idCounter.current++}`;
    const pos = { x: Math.random() * 10 - 5, y: 0, z: Math.random() * 10 - 5 };
    const hbId = `hb-${id}`;
    const hrId = `hr-${id}`;
    mgrRef.current.addHitBox({
      id: hbId,
      ownerId: id,
      position: pos,
      size: { x: 1, y: 1, z: 1 },
      active: false,
      damage: 10,
      damageType: 'physical',
      knockback: 2,
    });
    mgrRef.current.addHurtBox({
      id: hrId,
      ownerId: id,
      position: pos,
      size: { x: 0.8, y: 1.5, z: 0.8 },
      active: true,
    });
    setEntities((prev) => [
      ...prev,
      { id, name, hp: 100, maxHp: 100, position: pos, hitboxId: hbId, hurtboxId: hrId },
    ]);
  }, []);

  const attack = useCallback(
    (attackerId: string, targetId: string) => {
      const atkEntity = entities.find((e) => e.id === attackerId);
      if (atkEntity?.hitboxId) {
        mgrRef.current.setHitBoxActive(atkEntity.hitboxId, true);
      }
      const hits = mgrRef.current.checkCollisions();
      for (const h of hits) {
        setEntities((prev) =>
          prev.map((e) =>
            e.hurtboxId === h.hurtbox.id ? { ...e, hp: Math.max(0, e.hp - h.hitbox.damage) } : e
          )
        );
      }
      if (atkEntity?.hitboxId) {
        mgrRef.current.setHitBoxActive(atkEntity.hitboxId, false);
      }
      sync();
    },
    [entities, sync]
  );

  const registerCombo = useCallback((name: string) => {
    const id = `combo-${Date.now()}`;
    const chain = mgrRef.current.registerCombo(id, [
      { name: 'Jab', input: 'A', damage: 5, window: 0.5 },
      { name: 'Cross', input: 'B', damage: 8, window: 0.4 },
      { name: 'Upper', input: 'A', damage: 15, window: 0.3 },
    ]);
    setCombos((prev) => [...prev, chain]);
  }, []);

  const advanceCombo = useCallback((comboId: string, input: string) => {
    const result = mgrRef.current.advanceCombo(comboId, input);
    setCombos((prev) => prev.map((c) => (c.id === comboId ? { ...c } : c)));
    return result;
  }, []);

  const tick = useCallback(
    (dt = 1 / 60) => {
      mgrRef.current.updateCombos(dt);
      mgrRef.current.updateCooldowns(dt);
      sync();
    },
    [sync]
  );

  const reset = useCallback(() => {
    mgrRef.current = new CombatManager();
    idCounter.current = 0;
    setEntities([]);
    setCombos([]);
    setHitLog([]);
  }, []);

  return {
    manager: mgrRef.current,
    entities,
    combos,
    hitLog,
    spawnEntity,
    attack,
    registerCombo,
    advanceCombo,
    tick,
    reset,
  };
}
