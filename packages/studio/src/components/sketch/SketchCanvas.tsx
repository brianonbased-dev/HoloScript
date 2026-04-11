'use client';

/**
 * SketchCanvas — captures pointer events inside the R3F canvas
 * and converts them into 3D freehand stroke points.
 *
 * On desktop: pointer down/move/up on an invisible plane.
 * The plane is oriented toward the camera so strokes always
 * appear at a comfortable working depth (2 units in front).
 *
 * Renders all committed strokes + the active in-progress stroke.
 */

import { useRef, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useSketchStore } from '@/lib/sketchStore';
import { SketchStroke } from './SketchStroke';

// Invisible drawing plane (always faces camera, at depth 2)
const DRAW_PLANE = new THREE.Plane();
const _planeNormal = new THREE.Vector3();
const _hit = new THREE.Vector3();
const _raycaster = new THREE.Raycaster();

export function SketchCanvas() {
  const { camera, gl, size } = useThree();
  const isDrawing = useRef(false);

  const strokes = useSketchStore((s) => s.strokes);
  const activeStroke = useSketchStore((s) => s.activeStroke);
  const _brushSize = useSketchStore((s) => s.brushSize);
  const beginStroke = useSketchStore((s) => s.beginStroke);
  const appendPoint = useSketchStore((s) => s.appendPoint);
  const commitStroke = useSketchStore((s) => s.commitStroke);
  const cancelStroke = useSketchStore((s) => s.cancelStroke);

  // Update draw-plane normal to always face camera
  useFrame(() => {
    camera.getWorldDirection(_planeNormal);
    DRAW_PLANE.setFromNormalAndCoplanarPoint(
      _planeNormal,
      camera.position.clone().addScaledVector(_planeNormal, 2)
    );
  });

  const getNDC = useCallback(
    (clientX: number, clientY: number): THREE.Vector2 => {
      const rect = gl.domElement.getBoundingClientRect();
      return new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1
      );
    },
    [gl, size]
  );

  const hitOnPlane = useCallback(
    (ndc: THREE.Vector2): [number, number, number] | null => {
      _raycaster.setFromCamera(ndc, camera);
      const ok = _raycaster.ray.intersectPlane(DRAW_PLANE, _hit);
      if (!ok) return null;
      return [_hit.x, _hit.y, _hit.z];
    },
    [camera]
  );

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      if (e.button !== 0) return;
      isDrawing.current = true;
      beginStroke();
      const pt = hitOnPlane(getNDC(e.clientX, e.clientY));
      if (pt) appendPoint(pt);
    },
    [beginStroke, appendPoint, getNDC, hitOnPlane]
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDrawing.current) return;
      const pt = hitOnPlane(getNDC(e.clientX, e.clientY));
      if (pt) appendPoint(pt);
    },
    [appendPoint, getNDC, hitOnPlane]
  );

  const onPointerUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    commitStroke();
  }, [commitStroke]);

  const onPointerLeave = useCallback(() => {
    if (isDrawing.current) {
      isDrawing.current = false;
      cancelStroke();
    }
  }, [cancelStroke]);

  return (
    <>
      {/* Invisible hit-target mesh — covers the full viewport */}
      <mesh
        visible={false}
        onPointerDown={(e) => onPointerDown(e.nativeEvent as PointerEvent)}
        onPointerMove={(e) => onPointerMove(e.nativeEvent as PointerEvent)}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
      >
        <planeGeometry args={[1000, 1000]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>

      {/* Committed strokes */}
      {strokes.map((stroke) => (
        <SketchStroke key={stroke.id} stroke={stroke} />
      ))}

      {/* Active (in-progress) stroke */}
      {activeStroke && activeStroke.points.length >= 2 && <SketchStroke stroke={activeStroke} />}
    </>
  );
}
