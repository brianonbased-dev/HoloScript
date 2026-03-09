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
import { Loader2, CheckCircle, UploadCloud } from 'lucide-react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from 'three';
import { useSceneGraphStore } from '@/lib/stores';
import { useAssetStore } from '@/components/assets/useAssetStore';
import type { SceneNode } from '@/lib/stores';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProcessingStatus {
  state: 'idle' | 'uploading' | 'parsing' | 'done' | 'error';
  fileName?: string;
  message?: string;
  meshCount?: number;
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
        // Pre-warm materials for PBR and shadows before returning the group
        gltf.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            if (child.material) {
              // Ensure material is treated as Standard/Physical for envMap
              child.material.envMapIntensity = 1.0;
              child.material.needsUpdate = true;
              
              // If it's an array of materials
              if (Array.isArray(child.material)) {
                child.material.forEach((mat) => {
                  mat.envMapIntensity = 1.0;
                  mat.needsUpdate = true;
                });
              }
            }
          }
        });
        resolve(gltf.scene);
      },
      reject
    );
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAssetDropProcessor() {
  const addNode = useSceneGraphStore((s) => s.addNode);
  const addAsset = useAssetStore((s) => s.addAsset);
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          category: asset.category as any,
          size: asset.sizeKb * 1024,
          addedAt: Date.now(),
          tags: [],
        });

        if (!asset.is3D) {
          setStatus({ state: 'done', fileName: file.name, meshCount: 0 });
          setTimeout(() => setStatus({ state: 'idle' }), 2000);
          return;
        }

        // 3) Parse GLB in browser
        setStatus({ state: 'parsing', fileName: file.name });
        const buffer = await file.arrayBuffer();
        const group = await loadGLTFFromBuffer(buffer);

        // 4) Extract meshes → scene nodes
        let meshCount = 0;
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
            position: [p.x, p.y, p.z],
            rotation: [r.x, r.y, r.z],
            scale: [s.x, s.y, s.z],
            traits: [
              { name: 'mesh', properties: { geometry: 'imported', src: asset.src } },
              { name: 'material', properties: { color: '#ffffff', type: 'standard' } },
            ],
          };
          addNode(node);
        });

        setStatus({ state: 'done', fileName: file.name, meshCount });
        setTimeout(() => setStatus({ state: 'idle' }), 3000);
      } catch (e) {
        setStatus({
          state: 'error',
          fileName: file.name,
          message: e instanceof Error ? e.message : String(e),
        });
        setTimeout(() => setStatus({ state: 'idle' }), 4000);
      }
    },
    [addNode, addAsset]
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
