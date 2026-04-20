'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles, Code2, ImagePlus } from 'lucide-react';
import { PanelSplitter } from '@holoscript/ui';
import { ResponsiveStudioLayout } from '@/components/layouts/ResponsiveStudioLayout';
import { HologramDropZone } from '@/components/hologram/HologramDropZone';
import { useSceneStore } from '@/lib/stores';
import { useScenePipeline } from '@/hooks/useScenePipeline';

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
        <div className="flex items-center gap-2 text-sm text-studio-muted animate-pulse">
          <Sparkles className="h-4 w-4" />
          Loading preview…
        </div>
      </div>
    ),
  }
);

const HoloScriptEditor = dynamic(
  () =>
    import('@/components/editor/HoloScriptEditor').then((m) => ({ default: m.HoloScriptEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
        <div className="flex items-center gap-2 text-sm text-studio-muted animate-pulse">
          <Code2 className="h-4 w-4" />
          Loading editor…
        </div>
      </div>
    ),
  }
);

export default function PlaygroundPage() {
  const code = useSceneStore((s) => s.code);
  const setCode = useSceneStore((s) => s.setCode);
  const r3fTree = useSceneStore((s) => s.r3fTree);
  const setR3FTree = useSceneStore((s) => s.setR3FTree);
  const setErrors = useSceneStore((s) => s.setErrors);

  const { r3fTree: pipedTree, errors: pipelineErrors } = useScenePipeline(code);

  useEffect(() => {
    setR3FTree(pipedTree);
    setErrors(pipelineErrors);
  }, [pipedTree, pipelineErrors, setR3FTree, setErrors]);

  const onCompositionGenerated = useCallback(
    (generated: string) => {
      setCode(generated);
    },
    [setCode]
  );

  const [topHeight, setTopHeight] = useState(420);

  return (
    <ResponsiveStudioLayout
      leftPanel={
        <div className="flex h-full flex-col gap-3 p-4">
          <div className="flex items-center gap-2 text-studio-text">
            <ImagePlus className="h-4 w-4 shrink-0 text-studio-accent" aria-hidden="true" />
            <h2 className="text-sm font-semibold">Image → Hologram</h2>
          </div>
          <p className="text-xs leading-relaxed text-studio-muted">
            Drop images, GIFs, or short videos. A HoloScript composition is generated and loaded into
            the editor; the preview updates as you edit.
          </p>
          <HologramDropZone onCompositionGenerated={onCompositionGenerated} className="min-h-[200px]" />
        </div>
      }
      leftTitle="Playground"
    >
      <div className="relative flex h-full w-full flex-col overflow-hidden bg-studio-bg">
        <div
          style={{ height: topHeight, minHeight: 200 }}
          className="relative flex shrink-0 flex-col bg-[#0a0a12]"
        >
          <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 shadow-md backdrop-blur">
            <Sparkles className="h-4 w-4 text-studio-accent" aria-hidden="true" />
            <span className="whitespace-nowrap text-xs font-semibold tracking-wide text-studio-text">
              PREVIEW
            </span>
          </div>
          <div className="relative flex-1">
            <SceneRenderer r3fTree={r3fTree} />
          </div>
        </div>
        <div className="relative z-20">
          <PanelSplitter
            direction="vertical"
            onDelta={(delta) => setTopHeight((h) => Math.max(200, h + delta))}
          />
        </div>
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="pointer-events-none absolute right-5 top-3 z-10 flex items-center gap-2 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 shadow-md backdrop-blur">
            <Code2 className="h-4 w-4 text-blue-400" aria-hidden="true" />
            <span className="text-xs font-semibold text-white/90">HOLOSCRIPT</span>
          </div>
          <div className="h-full min-h-[240px]">
            <HoloScriptEditor />
          </div>
        </div>
      </div>
    </ResponsiveStudioLayout>
  );
}
