'use client';

import { useCallback, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { useBuilderStore } from '@/lib/stores/builderStore';
import * as THREE from 'three';

/**
 * GizmoController — attaches drei TransformControls to the selected mesh.
 * Traverses the R3F scene to find the Object3D tagged with userData.nodeId.
 */
export function GizmoController() {
  const { scene } = useThree();
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const updateNodeTransform = useSceneGraphStore((s) => s.updateNodeTransform);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const gridSize = useBuilderStore((s) => s.gridSize);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const controlsRef = useRef<any>(null);

  // Find the Three.js object whose userData.nodeId matches the selection
  const target: THREE.Object3D | null = selectedId
    ? (() => {
        let found: THREE.Object3D | null = null;
        scene.traverse((obj: THREE.Object3D) => {
          if (!found && obj.userData?.nodeId === selectedId) found = obj as THREE.Object3D;
        });
        return found;
      })()
    : null;

  const handleChange = useCallback(() => {
    if (!target || !selectedId) return;
    const t = target as THREE.Object3D;
    updateNodeTransform(selectedId, {
      position: [t.position.x, t.position.y, t.position.z],
      rotation: [t.rotation.x, t.rotation.y, t.rotation.z],
      scale: [t.scale.x, t.scale.y, t.scale.z],
    });
  }, [target, selectedId, updateNodeTransform]);

  if (!target) return null;
  return (
    <TransformControls
      ref={controlsRef}
      object={target}
      mode={gizmoMode}
      translationSnap={gridSnap ? gridSize : undefined}
      rotationSnap={gridSnap ? Math.PI / 12 : undefined}
      scaleSnap={gridSnap ? 0.25 : undefined}
      onMouseUp={handleChange}
    />
  );
}
