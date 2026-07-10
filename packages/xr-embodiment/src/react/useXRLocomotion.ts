import { useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import type * as THREE from 'three';
import { XRLocomotionController, type XRLocomotionConfig } from '../three/XRLocomotionController';

/**
 * useXRLocomotion — R3F hook that wires thumbstick locomotion (move + turn +
 * teleport) into the current Canvas / <XR> tree, using the SAME
 * XRLocomotionController the raw-three ImmersiveViewer uses. Drop it inside any
 * @react-three/xr scene to give it identical locomotion with zero duplication.
 */
export function useXRLocomotion(config?: XRLocomotionConfig) {
  const gl = useThree((s) => s.gl) as unknown as THREE.WebGLRenderer;
  const ref = useRef<XRLocomotionController | null>(null);

  useEffect(() => {
    const controller = new XRLocomotionController({ renderer: gl, ...config });
    ref.current = controller;
    return () => {
      controller.dispose();
      ref.current = null;
    };
    // deps: [gl] only — config is captured at mount by design. (Plain comment, not an
    // eslint-disable: react-hooks plugin isn't loaded in this package's flat config, so
    // referencing its rule name errors with "Definition for rule ... was not found".)
  }, [gl]);

  useFrame(() => {
    ref.current?.update(typeof performance !== 'undefined' ? performance.now() : 0);
  });

  return {
    teleport: (x: number, z: number) => ref.current?.teleport(x, z),
    setSpeed: (metresPerSecond: number) => ref.current?.setSpeed(metresPerSecond),
    getController: () => ref.current,
  };
}
