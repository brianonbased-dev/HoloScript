'use client';

import { Suspense, useState, useCallback, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Stars, Environment } from '@react-three/drei';
import type { R3FNode } from '@holoscript/core';
import { R3FNodeRenderer } from './R3FNodeRenderer';
import { useEditorStore, useSceneGraphStore } from '@/lib/store';
import type { SceneNode } from '@/lib/store';
import { ASSET_DRAG_TYPE } from '@/components/assets/AssetLibrary';
import type { Asset } from '@/components/assets/useAssetStore';
import { VREditSession, xrStore } from '@/components/vr/VREditSession';
import { PerformanceOverlay } from '@/components/profiler/PerformanceOverlay';

interface SceneRendererProps {
  r3fTree: R3FNode | null;
  profilerOpen?: boolean;
}

function SceneContent({ r3fTree }: { r3fTree: R3FNode }) {
  const setSelectedId = useEditorStore((s) => s.setSelectedObjectId);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasLights = r3fTree.children?.some(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c: any) =>
      c.type === 'ambientLight' ||
      c.type === 'directionalLight' ||
      c.type === 'pointLight' ||
      c.type === 'spotLight' ||
      c.type === 'hemisphereLight'
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasEnv = r3fTree.children?.some((c: any) => c.type === 'Environment');

  return (
    <group onClick={() => setSelectedId(null)}>
      {!hasLights && (
        <>
          <ambientLight intensity={0.4} color="#e8e0ff" />
          <directionalLight position={[5, 10, 5]} intensity={1} castShadow />
        </>
      )}
      {!hasEnv && <Environment preset="studio" background={false} />}
      <R3FNodeRenderer node={r3fTree} />
    </group>
  );
}

function EmptyScene() {
  return (
    <group>
      <ambientLight intensity={0.3} />
      <directionalLight position={[5, 10, 5]} intensity={0.8} />
      <Environment preset="studio" background={false} />
    </group>
  );
}

// ─── Category → node type + trait mapping ────────────────────────────────────

function assetToNodeType(category: Asset['category']): SceneNode['type'] {
  if (category === 'splat') return 'splat';
  if (category === 'audio') return 'audio';
  if (category === 'model') return 'mesh';
  return 'mesh';
}

function assetToTrait(asset: Asset): { name: string; properties: Record<string, unknown> } | null {
  switch (asset.category) {
    case 'splat':
      return { name: 'gaussian_splat', properties: { source: asset.src, quality: 'medium', sh_degree: 3 } };
    case 'audio':
      return { name: 'audio_source', properties: { src: asset.src, volume: 1.0, loop: false, spatial: true } };
    case 'hdri':
      return { name: 'environment', properties: { src: asset.src } };
    default:
      return null;
  }
}

// ─── Main renderer with drop zone ────────────────────────────────────────────

export function SceneRenderer({ r3fTree, profilerOpen = false }: SceneRendererProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const addNode = useSceneGraphStore((s) => s.addNode);
  const addTrait = useSceneGraphStore((s) => s.addTrait);

  // ─── XR support detection ──────────────────────────────────────────────────
  const [xrSupport, setXrSupport] = useState<{ vr: boolean; ar: boolean }>({ vr: false, ar: false });

  useEffect(() => {
    if (!navigator.xr) return;
    Promise.all([
      navigator.xr.isSessionSupported('immersive-vr').catch(() => false),
      navigator.xr.isSessionSupported('immersive-ar').catch(() => false),
    ]).then(([vr, ar]) => setXrSupport({ vr, ar }));
  }, []);

  // ─── Asset drag/drop ────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      const raw = e.dataTransfer.getData(ASSET_DRAG_TYPE);
      if (!raw) return;

      try {
        const asset = JSON.parse(raw) as Asset;
        const nodeId = `dropped-${Date.now()}`;
        const node: SceneNode = {
          id: nodeId,
          name: asset.name,
          type: assetToNodeType(asset.category),
          parentId: null,
          traits: [],
          position: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        };
        addNode(node);

        const trait = assetToTrait(asset);
        if (trait) addTrait(nodeId, trait);
      } catch {
        // ignore malformed drag data
      }
    },
    [addNode, addTrait]
  );

  return (
    <div
      className="relative h-full w-full"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <Canvas
        camera={{ position: [3, 3, 5], fov: 60 }}
        shadows
        style={{ background: '#0a0a12' }}
        gl={{ antialias: true, toneMapping: 3 }}
      >
        <Suspense fallback={null}>
          {r3fTree ? <SceneContent r3fTree={r3fTree} /> : <EmptyScene />}
        </Suspense>

        <OrbitControls
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minDistance={1}
          maxDistance={50}
        />

        <Grid
          args={[20, 20]}
          cellSize={1}
          cellThickness={0.5}
          cellColor="#2d2d3d"
          sectionSize={5}
          sectionThickness={1}
          sectionColor="#3d3d4d"
          fadeDistance={25}
          position={[0, -0.01, 0]}
        />

        <Stars radius={80} depth={50} count={2000} factor={3} saturation={0.1} fade speed={0.5} />

        {/* VR edit session — active when XR is running */}
        <VREditSession />

        {/* Performance profiler overlay */}
        <PerformanceOverlay open={profilerOpen} />
      </Canvas>

      {/* Drop overlay */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded border-2 border-dashed border-studio-accent bg-studio-accent/10 backdrop-blur-[1px]">
          <div className="rounded-xl bg-studio-panel/90 px-6 py-4 text-center shadow-xl">
            <p className="text-base font-semibold text-studio-accent">Drop to place in scene</p>
            <p className="mt-0.5 text-xs text-studio-muted">Asset will be added at origin</p>
          </div>
        </div>
      )}

      {/* Enter VR / AR buttons */}
      {(xrSupport.vr || xrSupport.ar) && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          {xrSupport.ar && (
            <button
              onClick={() => xrStore.enterAR()}
              className="flex items-center gap-1.5 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 text-xs font-medium text-studio-muted backdrop-blur transition hover:border-studio-accent hover:text-studio-accent"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
              Enter AR
            </button>
          )}
          {xrSupport.vr && (
            <button
              onClick={() => xrStore.enterVR()}
              className="flex items-center gap-1.5 rounded-lg border border-studio-accent/60 bg-studio-accent/10 px-3 py-1.5 text-xs font-medium text-studio-accent backdrop-blur transition hover:bg-studio-accent hover:text-white"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.5 7h-17A1.5 1.5 0 002 8.5v7A1.5 1.5 0 003.5 17h3.17a2 2 0 001.66-.9L10.17 14h3.66l1.84 2.1a2 2 0 001.66.9H20.5A1.5 1.5 0 0022 15.5v-7A1.5 1.5 0 0020.5 7zM8.5 13a2 2 0 110-4 2 2 0 010 4zm7 0a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
              Enter VR
            </button>
          )}
        </div>
      )}

      {/* Scene info overlay */}
      {r3fTree && r3fTree.children && (
        <div className="absolute bottom-3 left-3 rounded-md bg-studio-panel/80 px-3 py-1.5 text-xs text-studio-muted backdrop-blur">
          {r3fTree.children.length} object{r3fTree.children.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}

