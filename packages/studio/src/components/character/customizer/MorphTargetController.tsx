'use client';

/**
 * MorphTargetController — R3F component that applies morph weights
 *
 * Lives inside the Canvas. On each frame it reads morphTargets from the
 * character store and applies them to the loaded GLB mesh's morph targets.
 * Also handles skin color application to MeshStandardMaterial.
 */

import { useFrame, useThree } from '@react-three/fiber';
import { useCharacterStore } from '@/lib/store';
import * as THREE from 'three';
import { useRef, useEffect } from 'react';

/**
 * Map our slider IDs to common VRM/GLB morph target names.
 * Real models may use different naming; this maps the most common conventions.
 */
const MORPH_NAME_MAP: Record<string, string[]> = {
  // Body
  body_height:    ['Height', 'height', 'Body_Height'],
  body_build:     ['Build', 'build', 'Body_Build', 'Muscle', 'muscular'],
  body_shoulders: ['Shoulders', 'shoulders', 'Shoulder_Width'],
  body_chest:     ['Chest', 'chest', 'Bust'],
  body_waist:     ['Waist', 'waist', 'Waist_Size'],
  body_hips:      ['Hips', 'hips', 'Hip_Width'],
  body_arms:      ['ArmLength', 'arm_length', 'Arms'],
  body_legs:      ['LegLength', 'leg_length', 'Legs'],

  // Face
  face_eye_size:    ['EyeSize', 'eye_size', 'eyeWide', 'A_EyeOpen'],
  face_eye_spacing: ['EyeSpacing', 'eye_spacing', 'EyeWide'],
  face_nose_width:  ['NoseWidth', 'nose_width', 'Nose_Width'],
  face_nose_length: ['NoseLength', 'nose_length', 'Nose_Length'],
  face_mouth_width: ['MouthWidth', 'mouth_width', 'Mouth_Wide', 'mouthWide'],
  face_jaw_width:   ['JawWidth', 'jaw_width', 'Jaw_Width', 'jawOpen'],
  face_cheek:       ['Cheek', 'cheek', 'cheekPuff', 'CheekPuff'],
  face_brow:        ['BrowHeight', 'brow_height', 'browInnerUp', 'BrowUp'],
};

/**
 * Normalize slider value (0-100) to morph weight (0-1).
 * Simple linear mapping: 0 → 0.0, 50 → 0.5, 100 → 1.0
 */
function sliderToWeight(value: number): number {
  return Math.max(0, Math.min(1, value / 100));
}

export function MorphTargetController() {
  const { scene } = useThree();
  const meshesRef = useRef<THREE.SkinnedMesh[]>([]);

  // Gather all SkinnedMesh children on scene change
  useEffect(() => {
    const meshes: THREE.SkinnedMesh[] = [];
    scene.traverse((obj) => {
      if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
        meshes.push(obj as THREE.SkinnedMesh);
      }
    });
    meshesRef.current = meshes;
  }, [scene]);

  useFrame(() => {
    const { morphTargets, skinColor } = useCharacterStore.getState();
    const meshes = meshesRef.current;

    for (const mesh of meshes) {
      if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;

      // Apply morph targets
      for (const [sliderId, value] of Object.entries(morphTargets)) {
        const candidates = MORPH_NAME_MAP[sliderId];
        if (!candidates) continue;

        const weight = sliderToWeight(value);

        for (const name of candidates) {
          const idx = mesh.morphTargetDictionary[name];
          if (idx !== undefined) {
            mesh.morphTargetInfluences[idx] = weight;
            break; // Use first match
          }
        }
      }

      // Apply skin color to material
      if ((mesh.material as THREE.MeshStandardMaterial).color) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        // Only apply if the material name suggests skin (avoid overriding hair/clothes)
        const matName = mat.name?.toLowerCase() ?? '';
        if (matName.includes('skin') || matName.includes('body') || matName.includes('face') || matName === '') {
          mat.color.set(skinColor);
        }
      }
    }
  });

  return null; // Pure logic component — no render output
}
