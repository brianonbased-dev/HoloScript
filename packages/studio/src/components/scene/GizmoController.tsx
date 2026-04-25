'use client';

import { useCallback, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { TransformControls } from '@react-three/drei';
import { useEditorStore, useSceneGraphStore } from '@/lib/stores';
import { useBuilderStore } from '@/lib/stores/builderStore';
import { useStudioBus } from '@/hooks/useStudioBus';
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
  // Paper 24 CAEL instrumentation: emit on the studio bus on gizmo
  // mouse-up so useStudioCAELSession captures the resulting transform.
  // Inert when no session hook is mounted (bus has no subscribers).
  const { emit } = useStudioBus();
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
    const position: [number, number, number] = [t.position.x, t.position.y, t.position.z];
    const rotation: [number, number, number] = [t.rotation.x, t.rotation.y, t.rotation.z];
    const scale: [number, number, number] = [t.scale.x, t.scale.y, t.scale.z];
    updateNodeTransform(selectedId, { position, rotation, scale });
    emit('ui.gizmo.transform', {
      nodeId: selectedId,
      mode: gizmoMode,
      position,
      rotation,
      scale,
      snapped: gridSnap,
    });
  }, [target, selectedId, updateNodeTransform, emit, gizmoMode, gridSnap]);

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
