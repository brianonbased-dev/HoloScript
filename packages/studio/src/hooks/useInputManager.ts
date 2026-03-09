'use client';
/**
 * useInputManager — Hook for input polling and action mapping
 */
import { useState, useCallback, useRef } from 'react';
import { InputManager } from '@holoscript/core';

export interface UseInputManagerReturn {
  keys: string[];
  mousePos: { x: number; y: number };
  gamepads: number;
  actions: string[];
  pressKey: (key: string) => void;
  releaseKey: (key: string) => void;
  moveMouse: (x: number, y: number) => void;
  connectGamepad: (id?: string) => void;
  mapAction: (name: string, keys: string[]) => void;
  buildDemo: () => void;
  reset: () => void;
}

export function useInputManager(): UseInputManagerReturn {
  const mgr = useRef(new InputManager());
  const [keys, setKeys] = useState<string[]>([]);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [gamepads, setGamepads] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const padCounter = useRef(0);

  const sync = useCallback(() => {
    const snap = mgr.current.getSnapshot();
    const pressed: string[] = [];
    snap.keys.forEach((v, k) => {
      if (v.pressed) pressed.push(k);
    });
    setKeys(pressed);
    setMousePos({ x: snap.mouse.x, y: snap.mouse.y });
    setGamepads(snap.gamepads.size);
    const acts: string[] = [];
    snap.actions.forEach((v, k) => {
      if (v.pressed) acts.push(k);
    });
    setActions(acts);
  }, []);

  const pressKey = useCallback(
    (key: string) => {
      mgr.current.keyDown(key);
      mgr.current.update(0.016);
      sync();
    },
    [sync]
  );
  const releaseKey = useCallback(
    (key: string) => {
      mgr.current.keyUp(key);
      mgr.current.update(0.016);
      sync();
    },
    [sync]
  );
  const moveMouse = useCallback(
    (x: number, y: number) => {
      mgr.current.setMousePosition(x, y);
      sync();
    },
    [sync]
  );
  const connectGamepad = useCallback(
    (id = 'XInput Controller') => {
      mgr.current.connectGamepad(padCounter.current++, id);
      sync();
    },
    [sync]
  );
  const mapAction = useCallback(
    (name: string, k: string[]) => {
      mgr.current.mapAction(name, k);
      sync();
    },
    [sync]
  );

  const buildDemo = useCallback(() => {
    mgr.current = new InputManager();
    padCounter.current = 0;
    mgr.current.mapAction('jump', ['Space']);
    mgr.current.mapAction('move_left', ['a', 'ArrowLeft']);
    mgr.current.mapAction('move_right', ['d', 'ArrowRight']);
    mgr.current.mapAction('shoot', ['Mouse0']);
    mgr.current.mapAction('interact', ['e', 'f']);
    mgr.current.connectGamepad(0, 'XInput Controller');
    sync();
  }, [sync]);

  const reset = useCallback(() => {
    mgr.current = new InputManager();
    padCounter.current = 0;
    sync();
  }, [sync]);

  return {
    keys,
    mousePos,
    gamepads,
    actions,
    pressKey,
    releaseKey,
    moveMouse,
    connectGamepad,
    mapAction,
    buildDemo,
    reset,
  };
}
