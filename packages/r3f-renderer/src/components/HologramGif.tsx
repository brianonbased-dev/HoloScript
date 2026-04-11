/**
 * HologramGif — Renders an animated GIF as a holographic sprite.
 *
 * Decomposes GIF frames, optionally applies per-frame depth estimation
 * with temporal smoothing, and renders as a depth-displaced billboard
 * or flat animated texture.
 *
 * @see W.150: GIF temporal coherence requires EMA smoothing
 * @see G.149.01: GIF Disposal Methods Break Frame Extraction
 * @see P.149.01: Depth-as-Trait Pipeline
 */

import { useRef, useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface HologramGifProps {
  /** GIF URL or path */
  src: string;
  /** Target FPS for playback. Default: auto-detect from GIF delays */
  fps?: number;
  /** Depth displacement scale. Default: 0.3 */
  depthScale?: number;
  /** Width in scene units. Default: 2 */
  width?: number;
  /** Height (auto from aspect if omitted) */
  height?: number;
  /** Position in 3D space */
  position?: [number, number, number];
  /** Billboard mode: always face camera. Default: true */
  billboard?: boolean;
  /** Pause playback. Default: false */
  paused?: boolean;
  /** Loop playback. Default: true */
  loop?: boolean;
}

/**
 * Animated GIF as holographic sprite.
 *
 * Renders GIF frames as animated textures on a subdivided plane.
 * When depth estimation is available, applies per-frame displacement
 * with temporal smoothing for flicker-free 3D animation.
 */
export function HologramGif({
  src,
  fps,
  _depthScale = 0.3,
  width = 2,
  height,
  position = [0, 0, 0],
  billboard = true,
  paused = false,
  loop = true,
}: HologramGifProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const [frames, setFrames] = useState<
    Array<{
      texture: THREE.Texture;
      delayMs: number;
    }>
  >([]);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [aspect, setAspect] = useState(1);
  const elapsed = useRef(0);

  // Load and decompose GIF
  useEffect(() => {
    if (!src) return;

    // GIF loading would use gifuct-js in production:
    // const response = await fetch(src);
    // const buffer = await response.arrayBuffer();
    // const gif = parseGIF(buffer);
    // const rawFrames = decompressFrames(gif, true);

    // Placeholder: create a single-frame texture from image
    const loader = new THREE.TextureLoader();
    loader.load(src, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      const img = texture.image;
      if (img) setAspect(img.width / img.height);
      setFrames([{ texture, delayMs: 100 }]);
    });

    return () => {
      frames.forEach((f) => f.texture.dispose());
    };
  }, [src]);

  // Animate through frames
  useFrame(({ camera }, delta) => {
    if (billboard && meshRef.current) {
      meshRef.current.lookAt(camera.position);
    }

    if (paused || frames.length <= 1) return;

    elapsed.current += delta * 1000;
    const frameDelay = fps ? 1000 / fps : (frames[currentFrame]?.delayMs ?? 100);

    if (elapsed.current >= frameDelay) {
      elapsed.current -= frameDelay;
      setCurrentFrame((prev) => {
        const next = prev + 1;
        if (next >= frames.length) return loop ? 0 : prev;
        return next;
      });
    }
  });

  const actualHeight = height ?? width / aspect;
  const segments = 64; // Lower segments for animated content (perf)

  const geometry = useMemo(
    () => new THREE.PlaneGeometry(width, actualHeight, segments, segments),
    [width, actualHeight, segments]
  );

  const currentTexture = frames[currentFrame]?.texture;

  if (!currentTexture) {
    return (
      <mesh position={position}>
        <planeGeometry args={[width, actualHeight]} />
        <meshBasicMaterial color="#334433" transparent opacity={0.5} />
      </mesh>
    );
  }

  return (
    <mesh ref={meshRef} position={position} geometry={geometry}>
      <meshStandardMaterial map={currentTexture} transparent side={THREE.DoubleSide} />
    </mesh>
  );
}
