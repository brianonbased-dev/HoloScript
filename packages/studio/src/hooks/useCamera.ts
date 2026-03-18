'use client';
/**
 * useCamera — Hook for camera controller preview and editing
 */
import { useState, useCallback, useRef } from 'react';
import { CameraController } from '@holoscript/core';

type CameraControllerInstance = InstanceType<typeof CameraController>;
type CameraState = ReturnType<CameraControllerInstance['getState']>;
type CameraMode = 'follow' | 'orbit' | 'free' | 'topDown' | 'fixed';

export interface UseCameraReturn {
  controller: CameraControllerInstance;
  state: CameraState;
  mode: CameraMode;
  modes: CameraMode[];
  setMode: (mode: CameraMode) => void;
  setTarget: (x: number, y: number, z: number) => void;
  move: (dx: number, dy: number, dz: number) => void;
  rotateOrbit: (angle: number, pitch: number) => void;
  zoom: (delta: number) => void;
  setFOV: (fov: number) => void;
  step: (dt?: number) => void;
  reset: () => void;
}

const ALL_MODES: CameraMode[] = ['follow', 'orbit', 'free', 'topDown', 'fixed'];

export function useCamera(): UseCameraReturn {
  const ctrlRef = useRef(new CameraController({ mode: 'orbit' }));
  const [state, setState] = useState<CameraState>(ctrlRef.current.getState());
  const [mode, setModeState] = useState<CameraMode>('orbit');

  const sync = useCallback(() => {
    setState(ctrlRef.current.getState());
  }, []);

  const setMode = useCallback(
    (m: CameraMode) => {
      ctrlRef.current.setMode(m);
      setModeState(m);
      sync();
    },
    [sync]
  );

  const setTarget = useCallback(
    (x: number, y: number, z: number) => {
      ctrlRef.current.setTarget(x, y, z);
      sync();
    },
    [sync]
  );

  const move = useCallback(
    (dx: number, dy: number, dz: number) => {
      ctrlRef.current.moveCamera(dx, dy, dz);
      sync();
    },
    [sync]
  );

  const rotateOrbit = useCallback(
    (angle: number, pitch: number) => {
      ctrlRef.current.rotateOrbit(angle, pitch);
      sync();
    },
    [sync]
  );

  const zoom = useCallback(
    (delta: number) => {
      ctrlRef.current.zoom(delta);
      sync();
    },
    [sync]
  );
  const setFOV = useCallback(
    (fov: number) => {
      ctrlRef.current.setFOV(fov);
      sync();
    },
    [sync]
  );
  const step = useCallback(
    (dt = 1 / 60) => {
      ctrlRef.current.update(dt);
      sync();
    },
    [sync]
  );
  const reset = useCallback(() => {
    ctrlRef.current = new CameraController({ mode: 'orbit' });
    setModeState('orbit');
    sync();
  }, [sync]);

  return {
    controller: ctrlRef.current,
    state,
    mode,
    modes: ALL_MODES,
    setMode,
    setTarget,
    move,
    rotateOrbit,
    zoom,
    setFOV,
    step,
    reset,
  };
}
