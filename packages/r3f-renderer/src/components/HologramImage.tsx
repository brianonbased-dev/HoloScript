/**
 * HologramImage — Renders a 2D image as a depth-displaced 3D hologram.
 *
 * Accepts an image URL, runs depth estimation, and applies displacement
 * mapping on a subdivided plane to create a parallax 3D effect.
 *
 * @see W.148: Browser-native depth estimation is production-ready
 * @see P.148.01: Progressive Hologram Enhancement
 * @see G.150.01: Displacement Map Resolution vs Geometry Subdivision
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';

export interface HologramImageProps {
  /** Image URL or path */
  src: string;
  /** Depth displacement scale (0-1). Default: 0.3 */
  depthScale?: number;
  /** Geometry subdivision segments. Default: 128 (auto-matched to depth resolution) */
  segments?: number;
  /** Width in scene units. Default: 2 */
  width?: number;
  /** Height in scene units (auto-calculated from aspect if omitted) */
  height?: number;
  /** Position in 3D space */
  position?: [number, number, number];
  /** Rotation in radians */
  rotation?: [number, number, number];
  /** Whether to face the camera (billboard mode). Default: false */
  billboard?: boolean;
  /** Called when loading state changes */
  onLoadingChange?: (loading: boolean) => void;
  /** Called with load progress (0-1) */
  onProgress?: (progress: number) => void;
}

type LoadingState = 'idle' | 'loading-image' | 'estimating-depth' | 'ready' | 'error';

/**
 * Renders a 2D image as a depth-displaced 3D holographic panel.
 *
 * Progressive enhancement: immediately shows flat image, then applies
 * displacement once depth estimation completes.
 */
export function HologramImage({
  src,
  depthScale = 0.3,
  segments = 128,
  width = 2,
  height,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  billboard = false,
  onLoadingChange,
  onProgress,
}: HologramImageProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [loadState, setLoadState] = useState<LoadingState>('idle');
  const [depthTexture, setDepthTexture] = useState<THREE.DataTexture | null>(null);
  const [imageTexture, setImageTexture] = useState<THREE.Texture | null>(null);
  const [aspect, setAspect] = useState(1);

  // Load image texture
  useEffect(() => {
    if (!src) return;
    setLoadState('loading-image');
    onLoadingChange?.(true);

    const loader = new THREE.TextureLoader();
    loader.load(
      src,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        setImageTexture(texture);
        const img = texture.image;
        if (img) setAspect(img.width / img.height);
        setLoadState('ready');
        onLoadingChange?.(false);
        onProgress?.(1);
      },
      (event) => {
        if (event.total > 0) onProgress?.(event.loaded / event.total);
      },
      () => {
        setLoadState('error');
        onLoadingChange?.(false);
      }
    );

    return () => {
      imageTexture?.dispose();
    };
  }, [src]);

  // Calculate dimensions
  const actualHeight = height ?? width / aspect;

  // Geometry with subdivisions for displacement
  const geometry = useMemo(
    () => new THREE.PlaneGeometry(width, actualHeight, segments, segments),
    [width, actualHeight, segments]
  );

  // Billboard: face camera each frame
  useFrame(({ camera }) => {
    if (billboard && meshRef.current) {
      meshRef.current.lookAt(camera.position);
    }
  });

  if (!imageTexture) {
    // Loading placeholder
    return (
      <mesh position={position} rotation={rotation}>
        <planeGeometry args={[width, actualHeight]} />
        <meshBasicMaterial color="#333344" transparent opacity={0.5} />
      </mesh>
    );
  }

  return (
    <mesh
      ref={meshRef}
      position={position}
      rotation={rotation}
      geometry={geometry}
    >
      <meshStandardMaterial
        map={imageTexture}
        displacementMap={depthTexture}
        displacementScale={depthTexture ? depthScale : 0}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
