/**
 * QuiltViewer — Interactive quilt image viewer for Looking Glass content.
 *
 * Displays a quilt image (tiled multi-view) with interactive view scrubbing.
 * Mouse/touch position selects which tile (view) to display, simulating
 * the parallax effect of a Looking Glass display on a 2D screen.
 *
 * @see W.151: Quilt format is the interchange standard for holographic images
 */

import { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

export interface QuiltViewerProps {
  /** Quilt image URL (tiled multi-view image) */
  src: string;
  /** Number of columns in the quilt grid. Default: 8 */
  columns?: number;
  /** Number of rows in the quilt grid. Default: 6 */
  rows?: number;
  /** Width in scene units. Default: 3 */
  width?: number;
  /** Height (auto from tile aspect if omitted) */
  height?: number;
  /** Position in 3D space */
  position?: [number, number, number];
  /** Rotation in radians */
  rotation?: [number, number, number];
  /** Auto-animate through views. Default: false */
  autoAnimate?: boolean;
  /** Animation speed (views per second). Default: 10 */
  animationSpeed?: number;
}

/**
 * Interactive quilt viewer that scrubs through tile views based on
 * mouse/pointer position or auto-animation.
 */
export function QuiltViewer({
  src,
  columns = 8,
  rows = 6,
  width = 3,
  height,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  autoAnimate = false,
  animationSpeed = 10,
}: QuiltViewerProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [quiltTexture, setQuiltTexture] = useState<THREE.Texture | null>(null);
  const [currentView, setCurrentView] = useState(0);
  const totalViews = columns * rows;
  const animRef = useRef(0);

  // Load quilt texture
  useEffect(() => {
    if (!src) return;
    const loader = new THREE.TextureLoader();
    loader.load(src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      // Set repeat to show one tile at a time
      texture.repeat.set(1 / columns, 1 / rows);
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      setQuiltTexture(texture);
    });

    return () => {
      quiltTexture?.dispose();
    };
  }, [src, columns, rows]);

  // Update texture offset when view changes
  useEffect(() => {
    if (!quiltTexture) return;
    const col = currentView % columns;
    const row = Math.floor(currentView / columns);
    // Quilt standard: bottom-left = view 0
    quiltTexture.offset.set(col / columns, row / rows);
  }, [currentView, quiltTexture, columns, rows]);

  // Auto-animate or mouse scrubbing
  useFrame((_, delta) => {
    if (autoAnimate && quiltTexture) {
      animRef.current += delta * animationSpeed;
      const viewIdx = Math.floor(animRef.current) % totalViews;
      if (viewIdx !== currentView) {
        setCurrentView(viewIdx);
      }
    }
  });

  // Mouse scrubbing: horizontal position maps to view index
  const handlePointerMove = useCallback((event: THREE.Event & { uv?: THREE.Vector2 }) => {
    if (autoAnimate || !event.uv) return;
    const u = event.uv.x;
    const viewIdx = Math.floor(u * totalViews) % totalViews;
    setCurrentView(Math.max(0, Math.min(totalViews - 1, viewIdx)));
  }, [autoAnimate, totalViews]);

  // Tile aspect ratio for height calculation
  const tileAspect = quiltTexture
    ? (quiltTexture.image.width / columns) / (quiltTexture.image.height / rows)
    : 16 / 9;
  const actualHeight = height ?? width / tileAspect;

  if (!quiltTexture) {
    return (
      <mesh position={position} rotation={rotation}>
        <planeGeometry args={[width, actualHeight]} />
        <meshBasicMaterial color="#223344" transparent opacity={0.5} />
      </mesh>
    );
  }

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      onPointerMove={handlePointerMove}
    >
      <planeGeometry args={[width, actualHeight]} />
      <meshBasicMaterial map={quiltTexture} side={THREE.DoubleSide} />
    </mesh>
  );
}
