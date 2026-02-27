/**
 * VRHandController — Ray-cast select + pinch-drag gizmo
 *
 * @react-three/xr v6 compatible implementation.
 * Uses XRSpace + useFrame to read controller pose and
 * raw WebXR session events for select/selectend.
 *
 * - Hover: highlights nearest scene node by distance to ray
 * - Pinch/trigger selectstart: selects the node
 * - Pinch+drag: moves selected object along controller direction
 */

import { useRef, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useXR } from '@react-three/xr';
import * as THREE from 'three';
import { useSceneGraphStore, useEditorStore } from '@/lib/store';

// ─── Visual ray mesh (1m cylinder) ───────────────────────────────────────────

function ControllerRay({ groupRef, color }: { groupRef: React.RefObject<THREE.Group | null>; color: string }) {
  return (
    <group ref={groupRef}>
      <mesh position={[0, 0, -0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.0015, 0.0015, 1, 6]} />
        <meshBasicMaterial color={color} opacity={0.55} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

// ─── Per-hand controller logic ────────────────────────────────────────────────

interface HandControllerProps {
  handedness: 'left' | 'right';
}

function HandController({ handedness }: HandControllerProps) {
  const { gl } = useThree();
  const session = useXR((s) => s.session);
  const nodes = useSceneGraphStore((s) => s.nodes);
  const selectedId = useEditorStore((s) => s.selectedObjectId);
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);
  const updateNode = useSceneGraphStore((s) => s.updateNode);

  const groupRef = useRef<THREE.Group>(null);
  const rayColor = useRef('#6366f1');
  const isDragging = useRef(false);
  const dragOffset = useRef(new THREE.Vector3());
  const inputSource = useRef<XRInputSource | null>(null);

  // Track the matching input source
  useEffect(() => {
    if (!session) return;

    const onInputSourceChange = () => {
      const match = Array.from(session.inputSources).find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (src: any) => (src as XRInputSource).handedness === handedness
      ) as XRInputSource | undefined;
      inputSource.current = match ?? null;
    };

    session.addEventListener('inputsourceschange', onInputSourceChange);
    onInputSourceChange(); // Run once immediately
    return () => session.removeEventListener('inputsourceschange', onInputSourceChange);
  }, [session, handedness]);

  // Select start — find nearest node to ray
  useEffect(() => {
    const canvas = gl.domElement;
    const handleSelectStart = (e: Event) => {
      const xrEvent = e as XRInputSourceEvent;
      if (xrEvent.inputSource.handedness !== handedness) return;

      if (!groupRef.current) return;
      const origin = new THREE.Vector3();
      const direction = new THREE.Vector3(0, 0, -1);
      groupRef.current.getWorldPosition(origin);
      direction.transformDirection(groupRef.current.matrixWorld).normalize();

      const raycaster = new THREE.Raycaster();
      raycaster.set(origin, direction);

      let closest: { id: string; dist: number } | null = null;
      for (const node of nodes) {
        const np = new THREE.Vector3(...node.position);
        const dist = raycaster.ray.distanceToPoint(np);
        if (dist < 0.2 && (!closest || dist < closest.dist)) {
          closest = { id: node.id, dist };
        }
      }

      if (closest) {
        setSelectedId(closest.id);
        isDragging.current = true;
        const node = nodes.find((n) => n.id === closest!.id)!;
        dragOffset.current.set(...node.position).sub(origin);
        rayColor.current = '#22c55e';
      } else {
        setSelectedId(null);
        rayColor.current = '#6366f1';
      }
    };

    session?.addEventListener('selectstart', handleSelectStart as EventListener);
    return () => session?.removeEventListener('selectstart', handleSelectStart as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, handedness, nodes, setSelectedId]);

  // Select end — stop dragging
  useEffect(() => {
    const handleSelectEnd = (e: Event) => {
      const xrEvent = e as XRInputSourceEvent;
      if (xrEvent.inputSource.handedness !== handedness) return;
      isDragging.current = false;
      rayColor.current = '#6366f1';
    };

    session?.addEventListener('selectend', handleSelectEnd as EventListener);
    return () => session?.removeEventListener('selectend', handleSelectEnd as EventListener);
  }, [session, handedness]);

  // Update controller pose each frame + drag logic
  useFrame((state) => {
    if (!groupRef.current || !session || !inputSource.current) return;

    const frame = state.gl.xr.getFrame?.();
    const refSpace = state.gl.xr.getReferenceSpace?.();
    if (!frame || !refSpace) return;

    const { gripSpace } = inputSource.current;
    if (!gripSpace) return;

    try {
      const pose = frame.getPose(gripSpace, refSpace);
      if (!pose) return;

      const { position: p, orientation: q } = pose.transform;
      groupRef.current.position.set(p.x, p.y, p.z);
      groupRef.current.quaternion.set(q.x, q.y, q.z, q.w);
    } catch {
      // pose not yet available
    }

    // Drag selected object
    if (isDragging.current && selectedId) {
      const origin = new THREE.Vector3();
      groupRef.current.getWorldPosition(origin);
      const direction = new THREE.Vector3(0, 0, -1).transformDirection(groupRef.current.matrixWorld).normalize();
      const target = origin.clone().addScaledVector(direction, 1.0).add(dragOffset.current);
      updateNode(selectedId, { position: [target.x, target.y, target.z] });
    }
  });

  return <ControllerRay groupRef={groupRef} color={rayColor.current} />;
}

// ─── Both hands ───────────────────────────────────────────────────────────────

export function VRHandControllers() {
  return (
    <>
      <HandController handedness="left" />
      <HandController handedness="right" />
    </>
  );
}
