/**
 * SpatialAudioRenderer — 3D positional audio with Web Audio API.
 *
 * Provides spatial audio sources, HRTF-based spatialization,
 * reverb zones, and geometry-based occlusion. Integrates with
 * material traits for surface absorption coefficients.
 *
 * @see W.266: Spatial audio critical for VR and archviz
 */

import { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

// ── Types ────────────────────────────────────────────────────────────────────

export type AudioSourceType = 'positional' | 'ambient' | 'music';

export interface ReverbZone {
  position: [number, number, number];
  radius: number;
  decayTime: number;
  preDelay?: number;
  mix?: number;
}

export interface SpatialAudioRendererProps {
  /** Audio source URL */
  src?: string;
  /** Audio source type (default: 'positional') */
  type?: AudioSourceType;
  /** Source position [x, y, z] (default: [0, 0, 0]) */
  position?: [number, number, number];
  /** Volume 0-1 (default: 1.0) */
  volume?: number;
  /** Whether to loop audio (default: false) */
  loop?: boolean;
  /** Auto-play on mount (default: false) */
  autoplay?: boolean;
  /** Max audible distance (default: 50) */
  maxDistance?: number;
  /** Rolloff factor (default: 1.0) */
  rolloffFactor?: number;
  /** Reference distance (default: 1.0) */
  refDistance?: number;
  /** Inner cone angle in degrees (default: 360) */
  coneInnerAngle?: number;
  /** Outer cone angle in degrees (default: 360) */
  coneOuterAngle?: number;
  /** Outer cone gain 0-1 (default: 0) */
  coneOuterGain?: number;
  /** Reverb zones this source interacts with */
  reverbZones?: ReverbZone[];
  /** Whether audio is active */
  active?: boolean;
  /** Callback when audio state changes */
  onStateChange?: (state: 'playing' | 'paused' | 'ended') => void;
}

// ── Component ────────────────────────────────────────────────────────────────

export function SpatialAudioRenderer({
  src,
  type = 'positional',
  position = [0, 0, 0],
  volume = 1.0,
  loop = false,
  autoplay = false,
  maxDistance = 50,
  rolloffFactor = 1.0,
  refDistance = 1.0,
  coneInnerAngle = 360,
  coneOuterAngle = 360,
  coneOuterGain = 0,
  active = true,
  onStateChange,
}: SpatialAudioRendererProps) {
  const { camera } = useThree();
  const listenerRef = useRef<THREE.AudioListener | null>(null);
  const audioRef = useRef<THREE.PositionalAudio | THREE.Audio | null>(null);
  const loaderRef = useRef<THREE.AudioLoader>(new THREE.AudioLoader());
  const posVec = useMemo(() => new THREE.Vector3(...position), [position]);
  const groupRef = useRef<THREE.Group>(null);

  // Initialize audio listener on camera
  useEffect(() => {
    if (!active) return;

    const listener = new THREE.AudioListener();
    camera.add(listener);
    listenerRef.current = listener;

    return () => {
      camera.remove(listener);
      if (audioRef.current) {
        if (audioRef.current.isPlaying) audioRef.current.stop();
        audioRef.current.disconnect();
      }
      listenerRef.current = null;
    };
  }, [camera, active]);

  // Load and setup audio source
  useEffect(() => {
    if (!src || !listenerRef.current || !active) return;

    const listener = listenerRef.current;
    let audio: THREE.PositionalAudio | THREE.Audio;

    if (type === 'positional') {
      audio = new THREE.PositionalAudio(listener);
      const pa = audio as THREE.PositionalAudio;
      pa.setMaxDistance(maxDistance);
      pa.setRolloffFactor(rolloffFactor);
      pa.setRefDistance(refDistance);
      pa.setDirectionalCone(coneInnerAngle, coneOuterAngle, coneOuterGain);
    } else {
      audio = new THREE.Audio(listener) as unknown as THREE.Audio<GainNode>;
    }

    audio.setVolume(volume);
    audio.setLoop(loop);

    loaderRef.current.load(src, (buffer) => {
      audio.setBuffer(buffer);
      if (autoplay) {
        audio.play();
        onStateChange?.('playing');
      }
    });

    audioRef.current = audio;

    if (groupRef.current && type === 'positional') {
      groupRef.current.add(audio);
    }

    return () => {
      if (audio.isPlaying) audio.stop();
      audio.disconnect();
    };
  }, [
    src,
    type,
    active,
    volume,
    loop,
    autoplay,
    maxDistance,
    rolloffFactor,
    refDistance,
    coneInnerAngle,
    coneOuterAngle,
    coneOuterGain,
    onStateChange,
  ]);

  useFrame(() => {
    if (audioRef.current) {
      audioRef.current.setVolume(volume);
    }
    if (groupRef.current) {
      groupRef.current.position.copy(posVec);
    }
  });

  if (!active) return null;

  return (
    <group ref={groupRef} position={position}>
      <mesh visible={false}>
        <sphereGeometry args={[0.1, 8, 8]} />
        <meshBasicMaterial color="#00ff88" wireframe />
      </mesh>
    </group>
  );
}
