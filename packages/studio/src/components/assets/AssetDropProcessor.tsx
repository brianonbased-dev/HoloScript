'use client';

/**
 * AssetDropProcessor — handles GLTF/GLB drops onto the viewport
 *
 * Intercepts file-drop events from <input type="file"> or drag-drop,
 * POSTs to /api/assets/process for server-side storage, then parses
 * the GLB client-side with THREE.GLTFLoader to:
 *   1. Extract mesh names + geometry stats
 *   2. Register a SceneNode for each mesh in sceneGraphStore
 *   3. Add an Asset entry to useAssetStore
 *
 * For non-GLB assets (images, audio, HDRI) just adds to the asset library.
 */

import { useRef, useState, useCallback } from 'react';
import { Loader2, CheckCircle, UploadCloud, Grid3x3 } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { useSceneGraphStore } from '@/lib/stores';
import { StudioEvents } from '@/lib/analytics';
import { useAssetStore, type AssetCategory } from '@/components/assets/useAssetStore';
import { useDragSnap } from '@/hooks/useDragSnap';
import type { SceneNode } from '@/lib/stores';
import { SAVE_FEEDBACK_DURATION, STATUS_RESET_DURATION } from '@/lib/ui-timings';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessingStatus {
  state: 'idle' | 'uploading' | 'parsing' | 'done' | 'error';
  fileName?: string;
  message?: string;
  meshCount?: number;
  /** Set when grid snap was applied on drop */
  gridSnapped?: boolean;
  gridSize?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeId() {
  return `asset_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

async function loadGLTFFromBuffer(buffer: ArrayBuffer): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.parse(
      buffer,
      '',
      (gltf) => {
        // Pre-warm materials for PBR, shadows, and post-processing compatibility
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;

            const warmMaterial = (mat: THREE.Material) => {
              if (mat instanceof THREE.MeshStandardMaterial) {
                mat.envMapIntensity = 1.0;
              }
              // Ensure tone mapping is applied (required for post-processing pipeline)
              mat.toneMapped = true;

              // Auto-enable transparency for transmission materials
              if (
                'transmission' in mat &&
                (mat as unknown as { transmission: number }).transmission > 0
              ) {
                mat.transparent = true;
              }

              // Prevent Z-fighting on default GLB drops
              mat.polygonOffset = true;
              mat.polygonOffsetFactor = 1;
              mat.polygonOffsetUnits = 1;

              // Force depthWrite to avoid shadow sorting issues if transparent
              if (mat.transparent) {
                mat.depthWrite = true;
              }

              mat.needsUpdate = true;
            };

            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(warmMaterial);
              } else {
                warmMaterial(child.material);
              }
            }
          }
        });
        gltf.scene.userData.animations = gltf.animations || [];
        resolve(gltf.scene);
      },
      (error) => reject(error)
    );
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAssetDropProcessor() {
  const addNode = useSceneGraphStore((s) => s.addNode);
  const addAsset = useAssetStore((s) => s.addAsset);
  const { snapDrop } = useDragSnap();
  const [status, setStatus] = useState<ProcessingStatus>({ state: 'idle' });

  const processFile = useCallback(
    async (file: File) => {
      setStatus({ state: 'uploading', fileName: file.name });

      try {
        // 1) Upload to server
        const form = new FormData();
        form.append('file', file);
        const res = await fetch('/api/assets/process', { method: 'POST', body: form });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? 'Upload failed');
        }
        const { asset } = (await res.json()) as {
          asset: {
            id: string;
            name: string;
            src: string;
            category: string;
            is3D: boolean;
            sizeKb: number;
          };
        };

        // 2) Add to asset library
        addAsset({
          id: asset.id,
          name: asset.name,
          src: asset.src,
          category: asset.category as AssetCategory,
          size: asset.sizeKb * 1024,
          addedAt: Date.now(),
          tags: [],
        });

        StudioEvents.assetUploaded(asset.category, asset.sizeKb);

        if (!asset.is3D) {
          setStatus({ state: 'done', fileName: file.name, meshCount: 0 });
          setTimeout(() => setStatus({ state: 'idle' }), SAVE_FEEDBACK_DURATION);
          return;
        }

        // 3) Parse GLB in browser
        setStatus({ state: 'parsing', fileName: file.name });
        const buffer = await file.arrayBuffer();
        const group = await loadGLTFFromBuffer(buffer);

        // 4) Extract meshes → scene nodes
        let meshCount = 0;

        // Compute the overall bounding box then snap using useDragSnap
        // snapDrop handles both floor-snap (Y via bounding box) + grid-snap (X/Z)
        const box = new THREE.Box3().setFromObject(group);
        const snapResult = snapDrop(box);
        const [snapX, snapY, snapZ] = snapResult.position;

        // Auto-detect characters (if it has animations or 'rig'/'armature'/'mixamorig' in name, or if there is a SkinnedMesh)
        let isCharacter = false;
        if (group.userData.animations && group.userData.animations.length > 0) {
          isCharacter = true;
        } else {
          group.traverse((obj) => {
            if (
              obj.name.toLowerCase().includes('rig') ||
              obj.name.toLowerCase().includes('armature') ||
              obj.name.toLowerCase().includes('mixamorig') ||
              (obj as THREE.SkinnedMesh).isSkinnedMesh
            ) {
              isCharacter = true;
            }
          });
        }

        if (isCharacter) {
          const node: SceneNode = {
            id: makeId(),
            name: asset.name.replace(/\.[^/.]+$/, ''),
            type: 'gltfModel',
            parentId: null,
            position: [snapX, snapY, snapZ],
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            traits: [
              { name: 'gltf', properties: { src: asset.src } },
              { name: 'animation', properties: { state: 'idle' } },
            ],
          };
          addNode(node);
          meshCount = 1;
        } else {
          group.traverse((obj) => {
            if (!(obj instanceof THREE.Mesh)) return;
            meshCount++;

            const p = obj.position;
            const r = obj.rotation;
            const s = obj.scale;

            const node: SceneNode = {
              id: makeId(),
              name: obj.name || `Mesh_${meshCount}`,
              type: 'mesh',
              parentId: null,
              // X/Z get grid-snapped; Y = floor-snap from snapDrop
              position: [p.x + snapX, p.y + snapY, p.z + snapZ],
              rotation: [r.x, r.y, r.z],
              scale: [s.x, s.y, s.z],
              traits: [
                { name: 'mesh', properties: { geometry: 'imported', src: asset.src } },
                { name: 'material', properties: { color: '#ffffff', type: 'standard' } },
              ],
            };

            addNode(node);
          });
        }

        StudioEvents.assetImported(file.name, meshCount, isCharacter);
        setStatus({
          state: 'done',
          fileName: file.name,
          meshCount,
          gridSnapped: snapResult.gridSnapped,
          gridSize: snapResult.gridSize ?? undefined,
        });
        setTimeout(() => setStatus({ state: 'idle' }), STATUS_RESET_DURATION);
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        StudioEvents.assetImportFailed(file.name, errMsg);
        setStatus({
          state: 'error',
          fileName: file.name,
          message: errMsg,
        });
        setTimeout(() => setStatus({ state: 'idle' }), SAVE_FEEDBACK_DURATION);
      }
    },
    [addNode, addAsset, snapDrop]
  );

  return { processFile, status };
}

// ─── UI overlay ───────────────────────────────────────────────────────────────

export function AssetDropOverlay() {
  const { status } = useAssetDropProcessor();
  if (status.state === 'idle') return null;

  const icons = {
    uploading: <Loader2 className="h-5 w-5 animate-spin text-studio-accent" />,
    parsing: <Loader2 className="h-5 w-5 animate-spin text-studio-warning" />,
    done: <CheckCircle className="h-5 w-5 text-studio-success" />,
    error: <UploadCloud className="h-5 w-5 text-studio-error" />,
  };

  const messages = {
    uploading: `Uploading ${status.fileName}…`,
    parsing: `Parsing GLTF meshes…`,
    done: status.meshCount
      ? `Imported ${status.meshCount} mesh${status.meshCount !== 1 ? 'es' : ''} from ${status.fileName}`
      : `${status.fileName} added to library`,
    error: status.message ?? 'Upload failed',
  };

  return (
    <div className="absolute bottom-16 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-studio-border bg-studio-panel/95 px-4 py-3 shadow-xl backdrop-blur">
      {icons[status.state as keyof typeof icons]}
      <span className="text-sm text-studio-text">
        {messages[status.state as keyof typeof messages]}
      </span>
      {/* Grid snap badge — shown on successful done state */}
      {status.state === 'done' && status.gridSnapped && (
        <span className="flex items-center gap-1 rounded-md bg-indigo-500/20 border border-indigo-500/30 px-2 py-0.5 text-[11px] text-indigo-300">
          <Grid3x3 className="h-3 w-3" />
          Grid {status.gridSize}m
        </span>
      )}
    </div>
  );
}

// ─── File input trigger ───────────────────────────────────────────────────────

export function AssetFileInput({ onProcess }: { onProcess: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onProcess(file);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".glb,.gltf,.png,.jpg,.jpeg,.webp,.hdr,.mp3,.wav,.ogg"
        className="hidden"
        onChange={handleChange}
        id="asset-file-input"
      />
      <label
        htmlFor="asset-file-input"
        className="flex cursor-pointer items-center gap-1.5 rounded-md bg-studio-surface px-3 py-1.5 text-xs text-studio-text transition hover:bg-studio-border"
      >
        <UploadCloud className="h-3.5 w-3.5" />
        Import
      </label>
    </>
  );
}
