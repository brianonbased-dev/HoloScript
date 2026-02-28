'use client';

/**
 * CharacterLayout — The full Character mode layout
 *
 * Layout (3-panel):
 *
 *  ┌──────────────┬─────────────────────────────────┬──────────────┐
 *  │ SkeletonPanel│      Viewport (R3F Canvas)       │  ClipLibrary │
 *  │  OR Customize│  model + skeleton + gizmo        │  + Built-in  │
 *  │  OR Wardrobe │  GlbDropZone (when no model)     │  animations  │
 *  └──────────────┴─────────────────────────────────┴──────────────┘
 */

import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { useCharacterStore } from '@/lib/store';
import { SkeletonPanel } from '@/components/character/SkeletonPanel';
import { ClipLibrary } from '@/components/character/ClipLibrary';
import { GlbDropZone } from '@/components/character/GlbDropZone';
import { CharacterCustomizer } from '@/components/character/CharacterCustomizer';
import { MorphTargetController } from '@/components/character/MorphTargetController';
import { WardrobePanel } from '@/components/character/WardrobePanel';
import { Bone, Sliders, Shirt } from 'lucide-react';

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
  const panelMode = useCharacterStore((s) => s.panelMode);
  const setPanelMode = useCharacterStore((s) => s.setPanelMode);

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
          {panelMode === 'customize' && <MorphTargetController />}
        </Suspense>
      </Canvas>

      {/* Overlay: mode toggle */}
      <div className="pointer-events-auto absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <div className="flex rounded-full border border-studio-border bg-studio-panel/90 backdrop-blur overflow-hidden">
          <button
            onClick={() => setPanelMode('skeleton')}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] transition ${
              panelMode === 'skeleton' ? 'bg-purple-500/20 text-purple-300' : 'text-studio-muted hover:text-studio-text'
            }`}
            title="Skeleton / FK mode"
          >
            <Bone className="h-3 w-3" /> Skeleton
          </button>
          <button
            onClick={() => setPanelMode('customize')}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] transition ${
              panelMode === 'customize' ? 'bg-purple-500/20 text-purple-300' : 'text-studio-muted hover:text-studio-text'
            }`}
            title="Character customizer mode"
          >
            <Sliders className="h-3 w-3" /> Customize
          </button>
          <button
            onClick={() => setPanelMode('wardrobe')}
            className={`flex items-center gap-1 px-3 py-1 text-[10px] transition ${
              panelMode === 'wardrobe' ? 'bg-purple-500/20 text-purple-300' : 'text-studio-muted hover:text-studio-text'
            }`}
            title="Wardrobe mode"
          >
            <Shirt className="h-3 w-3" /> Wardrobe
          </button>
        </div>
      </div>
    </div>
  );
}

interface CharacterLayoutProps {
  /** Optional slot — unused, kept for layout API consistency */
  viewportSlot?: React.ReactNode;
}

export function CharacterLayout({ viewportSlot: _unused }: CharacterLayoutProps) {
  const panelMode = useCharacterStore((s) => s.panelMode);

  const LeftPanel = {
    skeleton: SkeletonPanel,
    customize: CharacterCustomizer,
    wardrobe: WardrobePanel,
  }[panelMode];

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left panel: context-dependent */}
      <LeftPanel />

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
