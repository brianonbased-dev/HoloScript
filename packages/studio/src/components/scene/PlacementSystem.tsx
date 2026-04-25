'use client';

import { useState, useCallback } from 'react';
import { ThreeEvent } from '@react-three/fiber';
import { useSceneGraphStore } from '@/lib/stores';
import { useBuilderStore, snapToGrid } from '@/lib/stores/builderStore';
import { useStudioBus } from '@/hooks/useStudioBus';

/**
 * GhostPreview — semi-transparent shape that follows the mouse on the ground
 */
function GhostPreview({ position }: { position: [number, number, number] }) {
  const activeShape = useBuilderStore((s) => s.hotbarSlots[s.activeSlot]);
  const builderMode = useBuilderStore((s) => s.builderMode);

  if (builderMode !== 'place') return null;

  const getGhostGeometry = () => {
    switch (activeShape.geometry) {
      case 'sphere':
        return <sphereGeometry args={[0.5, 32, 32]} />;
      case 'cylinder':
        return <cylinderGeometry args={[0.5, 0.5, 1, 32]} />;
      case 'cone':
        return <coneGeometry args={[0.5, 1, 4]} />;
      case 'torus':
        return <torusGeometry args={[0.5, 0.15, 16, 32]} />;
      case 'capsule':
        return <capsuleGeometry args={[0.3, 0.5, 4, 16]} />;
      case 'plane':
        return <planeGeometry args={[1, 1]} />;
      case 'ring':
        return <ringGeometry args={[0.3, 0.5, 32]} />;
      default:
        return <boxGeometry args={[1, 1, 1]} />;
    }
  };

  return (
    <mesh position={position}>
      {getGhostGeometry()}
      <meshBasicMaterial color={activeShape.color} transparent opacity={0.35} wireframe={false} />
    </mesh>
  );
}

/**
 * PlacementPlane — invisible ground plane for click-to-place.
 * In 'place' mode: click → create shape at snapped grid position.
 * In 'break' mode: handled by MeshNode.
 */
export function PlacementPlane() {
  const builderMode = useBuilderStore((s) => s.builderMode);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const gridSize = useBuilderStore((s) => s.gridSize);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const getActiveShape = useBuilderStore((s) => s.getActiveShape);
  const [ghostPos, setGhostPos] = useState<[number, number, number]>([0, 0.5, 0]);
  // Paper 24 CAEL instrumentation: emit on the studio bus so
  // useStudioCAELSession can route ui.* channels to the trace recorder.
  // Inert when no session hook is mounted (bus has no subscribers).
  const { emit } = useStudioBus();

  const handlePointerMove = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      if (builderMode !== 'place') return;
      e.stopPropagation();
      const point = e.point;
      const x = gridSnap ? snapToGrid(point.x, gridSize) : point.x;
      const z = gridSnap ? snapToGrid(point.z, gridSize) : point.z;
      setGhostPos([x, 0.5, z]);
    },
    [builderMode, gridSnap, gridSize]
  );

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      if (builderMode !== 'place') return;
      e.stopPropagation();
      const shape = getActiveShape();
      const point = e.point;
      const x = gridSnap ? snapToGrid(point.x, gridSize) : point.x;
      const z = gridSnap ? snapToGrid(point.z, gridSize) : point.z;
      const nodeId = `placed-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      addNode({
        id: nodeId,
        name: `${shape.label}-${nodeId.slice(-4)}`,
        type: 'mesh',
        parentId: null,
        traits: [],
        position: [x, 0.5, z],
        rotation: [0, 0, 0],
        scale: [1, 1, 1],
      });
      emit('ui.placement.click', {
        nodeId,
        shape: shape.geometry,
        position: [x, 0.5, z],
        snapped: gridSnap,
        gridSize,
      });
    },
    [builderMode, gridSnap, gridSize, addNode, getActiveShape, emit]
  );

  return (
    <>
      {/* Invisible ground plane for raycasting */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0, 0]}
        onPointerMove={handlePointerMove}
        onClick={handleClick}
        visible={false}
      >
        <planeGeometry args={[100, 100]} />
        <meshBasicMaterial />
      </mesh>
      <GhostPreview position={ghostPos} />
    </>
  );
}
