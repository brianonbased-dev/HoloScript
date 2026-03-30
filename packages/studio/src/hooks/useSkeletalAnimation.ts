import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export function useSkeletalAnimation(
  meshRef: React.RefObject<THREE.Object3D | null>,
  animations: THREE.AnimationClip[] | undefined,
  activeAction: string | undefined
) {
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});

  useMemo(() => {
    if (!meshRef.current || !animations || animations.length === 0) return;
    if (!mixerRef.current || mixerRef.current.getRoot() !== meshRef.current) {
      mixerRef.current = new THREE.AnimationMixer(meshRef.current);
      actionsRef.current = {};
    }
    const mixer = mixerRef.current;

    animations.forEach((clip) => {
      if (!actionsRef.current[clip.name]) {
        actionsRef.current[clip.name] = mixer.clipAction(clip);
      }
    });
  }, [animations, meshRef]);

  useMemo(() => {
    const actions = actionsRef.current;
    if (Object.keys(actions).length === 0) return;

    const target = activeAction || 'idle';
    let action = actions[target];

    if (!action) {
      const lowerKeys = Object.keys(actions).map((k) => k.toLowerCase());
      const idleFallback = lowerKeys.findIndex((k) => k.includes('idle'));
      if (idleFallback !== -1) {
        action = actions[Object.keys(actions)[idleFallback]];
      } else {
        action = Object.values(actions)[0];
      }
    }

    Object.values(actions).forEach((a) => {
      if (a !== action && a.isRunning()) a.fadeOut(0.2);
    });

    if (action && !action.isRunning()) {
      action.reset().fadeIn(0.2).play();
    }
  }, [activeAction, animations]);

  useFrame((state, delta) => {
    if (mixerRef.current) mixerRef.current.update(delta);
  });
}
