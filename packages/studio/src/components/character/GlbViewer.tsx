'use client';

/**
 * GlbViewer — R3F component that runs INSIDE the <Canvas>
 *
 * Responsibilities:
 *  1. Load the .glb / .gltf model from a URL
 *  2. Expose the skeleton bones to the CharacterStore (for the DOM panels)
 *  3. Render a THREE.SkeletonHelper overlay when showSkeleton=true
 *  4. Drive the TransformControls gizmo on the selected bone (FK)
 *  5. Run the recording sampler via useFrame
 *  6. Play back clips via AnimationMixer
 */

import { useEffect, useRef, useCallback } from 'react';
import { useLoader, useFrame, useThree } from '@react-three/fiber';
import { TransformControls, OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { useCharacterStore } from '@/lib/store';
import { buildClipFromFrames, extractBuiltinAnimations } from '@/lib/animationBuilder';
import type { BoneFrame } from '@/lib/animationBuilder';

// ─────────────────────────────────────────────────────────────────────────────

interface GlbViewerProps {
  url: string;
}

export function GlbViewer({ url }: GlbViewerProps) {
  const gltf = useLoader(GLTFLoader, url);
  const { scene: threeScene } = useThree();

  // Store state
  const setBoneNames = useCharacterStore((s) => s.setBoneNames);
  const setBuiltinAnimations = useCharacterStore((s) => s.setBuiltinAnimations);
  const selectedBoneIndex = useCharacterStore((s) => s.selectedBoneIndex);
  const showSkeleton = useCharacterStore((s) => s.showSkeleton);
  const isRecording = useCharacterStore((s) => s.isRecording);
  const setIsRecording = useCharacterStore((s) => s.setIsRecording);
  const addRecordedClip = useCharacterStore((s) => s.addRecordedClip);
  const activeBuiltinAnimation = useCharacterStore((s) => s.activeBuiltinAnimation);
  const activeClipId = useCharacterStore((s) => s.activeClipId);
  const recordedClips = useCharacterStore((s) => s.recordedClips);

  // Internal refs
  const skeletonRef = useRef<THREE.Skeleton | null>(null);
  const skeletonHelperRef = useRef<THREE.SkeletonHelper | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const recordingStartRef = useRef<number>(0);
  const framesRef = useRef<BoneFrame[]>([]);
  const modelGroupRef = useRef<THREE.Group>(null);

  // ── On model load: parse skeleton + built-in animations ──────────────────
  useEffect(() => {
    const group = gltf.scene;

    // Find all skinned meshes and extract the first skeleton
    let skeleton: THREE.Skeleton | null = null;
    group.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
        skeleton = (obj as THREE.SkinnedMesh).skeleton;
      }
    });

    skeletonRef.current = skeleton;

    if (skeleton) {
      setBoneNames((skeleton as THREE.Skeleton).bones.map((b) => b.name));
    }

    // Built-in animations
    if (gltf.animations?.length) {
      setBuiltinAnimations(extractBuiltinAnimations(gltf.animations));
    }

    // Set up AnimationMixer
    const mixer = new THREE.AnimationMixer(group);
    mixerRef.current = mixer;

    // Skeleton helper
    const helper = new THREE.SkeletonHelper(group);
    helper.visible = showSkeleton;
    skeletonHelperRef.current = helper;
    threeScene.add(helper);

    return () => {
      mixer.stopAllAction();
      threeScene.remove(helper);
      helper.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gltf]);

  // ── Sync skeleton helper visibility ──────────────────────────────────────
  useEffect(() => {
    if (skeletonHelperRef.current) {
      skeletonHelperRef.current.visible = showSkeleton;
    }
  }, [showSkeleton]);

  // ── Play built-in animations ──────────────────────────────────────────────
  useEffect(() => {
    const mixer = mixerRef.current;
    if (!mixer) return;
    mixer.stopAllAction();
    if (activeBuiltinAnimation) {
      const clip = gltf.animations.find((a) => a.name === activeBuiltinAnimation);
      if (clip) mixer.clipAction(clip).play();
    }
  }, [activeBuiltinAnimation, gltf.animations]);

  // ── Play recorded clips ───────────────────────────────────────────────────
  useEffect(() => {
    const mixer = mixerRef.current;
    const skeleton = skeletonRef.current;
    if (!mixer || !skeleton) return;
    mixer.stopAllAction();
    if (activeClipId) {
      const recordedClip = recordedClips.find((c) => c.id === activeClipId);
      if (recordedClip) {
        const clip = buildClipFromFrames(recordedClip.frames, skeleton, recordedClip.duration, recordedClip.name);
        mixer.clipAction(clip).play();
      }
    }
  }, [activeClipId, recordedClips]);

  // ── useFrame: advance mixer + recording sampler ───────────────────────────
  useFrame((_, delta) => {
    mixerRef.current?.update(delta);

    if (!isRecording) return;
    const skeleton = skeletonRef.current;
    if (!skeleton) return;

    const elapsed = performance.now() - recordingStartRef.current;
    skeleton.bones.forEach((bone, i) => {
      framesRef.current.push({
        time: elapsed,
        boneIndex: i,
        qx: bone.quaternion.x,
        qy: bone.quaternion.y,
        qz: bone.quaternion.z,
        qw: bone.quaternion.w,
      });
    });
  });

  // Expose start/stop recording to external components via the store watcher
  // (RecordingControls calls setIsRecording; we detect transitions here)
  const prevRecordingRef = useRef(false);
  useEffect(() => {
    if (!prevRecordingRef.current && isRecording) {
      // Recording started
      recordingStartRef.current = performance.now();
      framesRef.current = [];
    } else if (prevRecordingRef.current && !isRecording) {
      // Recording stopped — build clip
      const skeleton = skeletonRef.current;
      if (skeleton && framesRef.current.length > 0) {
        const durationMs = performance.now() - recordingStartRef.current;
        const id = Math.random().toString(36).slice(2, 10);
        addRecordedClip({
          id,
          name: `Take ${id.slice(0, 4)}`,
          duration: durationMs,
          frames: framesRef.current,
        });
        framesRef.current = [];
      }
    }
    prevRecordingRef.current = isRecording;
  }, [isRecording, addRecordedClip]);

  // ── Selected bone gizmo ───────────────────────────────────────────────────
  const selectedBone =
    selectedBoneIndex !== null && skeletonRef.current
      ? skeletonRef.current.bones[selectedBoneIndex] ?? null
      : null;

  return (
    <>
      {/* Orbit controls — disabled when a bone gizmo is active */}
      <OrbitControls makeDefault enablePan enableZoom enableRotate />

      {/* Ambient + directional light */}
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 10, 5]} intensity={1.2} castShadow />

      {/* Grid floor */}
      <gridHelper args={[10, 20, '#333', '#222']} position={[0, -0.01, 0]} />

      {/* The loaded GLB model */}
      <group ref={modelGroupRef}>
        <primitive object={gltf.scene} />
      </group>

      {/* FK bone gizmo — rotate mode only */}
      {selectedBone && (
        <TransformControls
          object={selectedBone}
          mode="rotate"
          size={0.6}
        />
      )}
    </>
  );
}
