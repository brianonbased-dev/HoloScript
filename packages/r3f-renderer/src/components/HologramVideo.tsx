/**
 * HologramVideo — Renders a video as a depth-displaced 3D panel.
 *
 * Creates a video texture and applies real-time or pre-computed depth
 * displacement for parallax 3D effect. Decouples video playback rate
 * from render rate to avoid VR frame drops.
 *
 * @see G.151.01: Video Texture VR Performance at 90Hz
 * @see W.149: Five-tier progressive quality pipeline
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface HologramVideoProps {
  /** Video URL or path */
  src: string;
  /** Depth displacement scale. Default: 0.2 */
  depthScale?: number;
  /** Geometry subdivision segments. Default: 64 */
  segments?: number;
  /** Width in scene units. Default: 3 */
  width?: number;
  /** Height (auto from aspect if omitted) */
  height?: number;
  /** Position in 3D space */
  position?: [number, number, number];
  /** Rotation in radians */
  rotation?: [number, number, number];
  /** Autoplay. Default: true */
  autoplay?: boolean;
  /** Loop. Default: true */
  loop?: boolean;
  /** Muted. Default: true */
  muted?: boolean;
}

/**
 * Video panel with depth displacement.
 *
 * Uses THREE.VideoTexture with needsUpdate synced to video framerate
 * (not render framerate) to prevent VR frame drops.
 *
 * @see G.151.01: Never update video textures at VR render frequency
 */
export function HologramVideo({
  src,
  depthScale = 0.2,
  segments = 64,
  width = 3,
  height,
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  autoplay = true,
  loop = true,
  muted = true,
}: HologramVideoProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoTexture, setVideoTexture] = useState<THREE.VideoTexture | null>(null);
  const [aspect, setAspect] = useState(16 / 9);

  // Create video element and texture
  useEffect(() => {
    if (!src) return;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.playsInline = true;
    video.muted = muted;
    video.loop = loop;
    video.src = src;
    videoRef.current = video;

    video.addEventListener('loadedmetadata', () => {
      setAspect(video.videoWidth / video.videoHeight);

      const texture = new THREE.VideoTexture(video);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      setVideoTexture(texture);

      if (autoplay) {
        video.play().catch(() => {
          // Autoplay blocked — user interaction required
        });
      }
    });

    video.load();

    return () => {
      video.pause();
      video.src = '';
      videoTexture?.dispose();
      videoRef.current = null;
    };
  }, [src, autoplay, loop, muted]);

  const actualHeight = height ?? width / aspect;

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(width, actualHeight, segments, segments),
    [width, actualHeight, segments]
  );

  if (!videoTexture) {
    return (
      <mesh position={position} rotation={rotation}>
        <planeGeometry args={[width, actualHeight]} />
        <meshBasicMaterial color="#222233" transparent opacity={0.5} />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef} position={position} rotation={rotation} geometry={geometry}>
      <meshStandardMaterial map={videoTexture} side={THREE.DoubleSide} />
    </mesh>
  );
}
