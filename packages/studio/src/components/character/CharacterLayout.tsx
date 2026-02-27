'use client';

/**
 * CharacterLayout — The full Character mode layout
 *
 * Layout (3-panel):
 *
 *  ┌──────────────┬─────────────────────────────────┬──────────────┐
 *  │ SkeletonPanel│      Viewport (R3F Canvas)       │  ClipLibrary │
 *  │  bone tree   │  model + skeleton + gizmo        │  + Built-in  │
 *  │  FK select   │  GlbDropZone (when no model)     │  animations  │
 *  └──────────────┴─────────────────────────────────┴──────────────┘
 */

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useCharacterStore } from '@/lib/store';
import { SkeletonPanel } from '@/components/character/SkeletonPanel';
import { ClipLibrary } from '@/components/character/ClipLibrary';
import { GlbDropZone } from '@/components/character/GlbDropZone';

// Dynamically import the R3F viewer to avoid SSR issues
// MEME-012: Using OptimizedGlbViewer for <500ms load times
const GlbViewer = dynamic(
  () => import('@/components/character/OptimizedGlbViewer').then((m) => ({ default: m.OptimizedGlbViewer })),
  { ssr: false }
);

function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        <p className="text-xs text-studio-muted">Loading model…</p>
      </div>
    </div>
  );
}

function Viewport() {
  const glbUrl = useCharacterStore((s) => s.glbUrl);

  if (!glbUrl) {
    return <GlbDropZone />;
  }

  return (
    <div className="relative h-full w-full">
      <Canvas
        camera={{ position: [0, 1.5, 3.5], fov: 50 }}
        gl={{ antialias: true }}
        shadows
        className="h-full w-full"
      >
        <Suspense fallback={null}>
          <GlbViewer url={glbUrl} />
        </Suspense>
      </Canvas>

      {/* Overlay: model info bar */}
      <div className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-studio-border bg-studio-panel/80 px-3 py-1 backdrop-blur">
        <p className="text-[10px] text-studio-muted">
          Orbit: drag • Zoom: scroll • FK: select bone & drag gizmo
        </p>
      </div>
    </div>
  );
}

interface CharacterLayoutProps {
  /** Optional slot — unused, kept for layout API consistency */
  viewportSlot?: React.ReactNode;
}

export function CharacterLayout({ viewportSlot: _unused }: CharacterLayoutProps) {
  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Skeleton panel */}
      <SkeletonPanel />

      {/* Center: 3D Viewport */}
      <div className="relative flex-1 overflow-hidden bg-studio-bg">
        <Suspense fallback={<LoadingSpinner />}>
          <Viewport />
        </Suspense>
      </div>

      {/* Right: Clip library + built-in animations */}
      <ClipLibrary />
    </div>
  );
}
