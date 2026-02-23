'use client';

import { useRef, useEffect } from 'react';
import { TransformControls } from '@react-three/drei';
import { useEditorStore, useSceneGraphStore } from '@/lib/store';
import * as THREE from 'three';

export function TransformGizmos() {
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const gizmoMode = useEditorStore((s) => s.gizmoMode);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const updateNodeTransform = useSceneGraphStore((s) => s.updateNodeTransform);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ref = useRef<any>(null);
  const targetRef = useRef(new THREE.Object3D());

  const selectedNode = selectedId ? nodes.find((n) => n.id === selectedId) : null;

  // Sync THREE object position/rotation/scale from store when selection changes
  useEffect(() => {
    if (!selectedNode) return;
    const obj = targetRef.current;
    obj.position.set(...selectedNode.position);
    obj.rotation.set(
      THREE.MathUtils.degToRad(selectedNode.rotation[0]),
      THREE.MathUtils.degToRad(selectedNode.rotation[1]),
      THREE.MathUtils.degToRad(selectedNode.rotation[2])
    );
    obj.scale.set(...selectedNode.scale);
  }, [selectedNode]);

  // Write changes back to store on transform-end
  useEffect(() => {
    const controls = ref.current;
    if (!controls || !selectedId) return;

    const handleChange = () => {
      const obj = targetRef.current;
      updateNodeTransform(selectedId, {
        position: [obj.position.x, obj.position.y, obj.position.z],
        rotation: [
          Math.round(THREE.MathUtils.radToDeg(obj.rotation.x) * 10) / 10,
          Math.round(THREE.MathUtils.radToDeg(obj.rotation.y) * 10) / 10,
          Math.round(THREE.MathUtils.radToDeg(obj.rotation.z) * 10) / 10,
        ],
        scale: [obj.scale.x, obj.scale.y, obj.scale.z],
      });
    };

    controls.addEventListener('objectChange', handleChange);
    return () => controls.removeEventListener('objectChange', handleChange);
  }, [selectedId, updateNodeTransform]);

  if (!selectedNode) return null;

  return (
    <TransformControls
      ref={ref}
      object={targetRef.current}
      mode={gizmoMode}
      size={0.8}
    />
  );
}
