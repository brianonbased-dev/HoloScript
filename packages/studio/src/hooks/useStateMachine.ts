'use client';
/**
 * useStateMachine — Hook for hierarchical state machine editing
 */
import { useState, useCallback, useRef } from 'react';
import { StateMachine } from '@holoscript/core';

export interface SMState { id: string; parent?: string; }
export interface SMTransition { from: string; to: string; event: string; }

export interface UseStateMachineReturn {
  currentState: string | null;
  states: SMState[];
  transitions: SMTransition[];
  history: string[];
  send: (event: string) => boolean;
  buildDemo: () => void;
  reset: () => void;
}

export function useStateMachine(): UseStateMachineReturn {
  const sm = useRef(new StateMachine());
  const [currentState, setCurrentState] = useState<string | null>(null);
  const [states, setStates] = useState<SMState[]>([]);
  const [transitions, setTransitions] = useState<SMTransition[]>([]);
  const [history, setHistory] = useState<string[]>([]);

  const sync = useCallback(() => {
    setCurrentState(sm.current.getCurrentState());
    setHistory(sm.current.getHistory());
  }, []);

  const send = useCallback((event: string) => {
    const ok = sm.current.send(event);
    sync();
    return ok;
  }, [sync]);

  const buildDemo = useCallback(() => {
    sm.current = new StateMachine();
    const demoStates: SMState[] = [
      { id: 'idle' }, { id: 'patrol' }, { id: 'chase' },
      { id: 'attack' }, { id: 'flee' }, { id: 'dead' },
    ];
    const demoTransitions: SMTransition[] = [
      { from: 'idle', to: 'patrol', event: 'START' },
      { from: 'patrol', to: 'chase', event: 'ENEMY_SPOTTED' },
      { from: 'chase', to: 'attack', event: 'IN_RANGE' },
      { from: 'attack', to: 'chase', event: 'OUT_OF_RANGE' },
      { from: 'chase', to: 'flee', event: 'LOW_HEALTH' },
      { from: 'attack', to: 'flee', event: 'LOW_HEALTH' },
      { from: 'flee', to: 'idle', event: 'SAFE' },
      { from: 'attack', to: 'dead', event: 'KILLED' },
      { from: 'chase', to: 'dead', event: 'KILLED' },
    ];
    for (const s of demoStates) sm.current.addState({ id: s.id, parent: s.parent });
    for (const t of demoTransitions) sm.current.addTransition({ from: t.from, to: t.to, event: t.event });
    sm.current.setInitialState('idle');
    setStates(demoStates);
    setTransitions(demoTransitions);
    sync();
  }, [sync]);

  const reset = useCallback(() => { sm.current = new StateMachine(); setStates([]); setTransitions([]); sync(); }, [sync]);

  return { currentState, states, transitions, history, send, buildDemo, reset };
}
