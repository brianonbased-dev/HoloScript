'use client';

import React, { useState } from 'react';
import dynamic from 'next/dynamic';
import { ResponsiveStudioLayout } from '@/components/layouts/ResponsiveStudioLayout';
import { PanelSplitter } from '@holoscript/ui';
import { Sparkles, Code2 } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';

const BrittneyChatPanel = dynamic(
  () => import('@/components/ai/BrittneyChatPanel').then((m) => ({ default: m.BrittneyChatPanel })),
  { ssr: false }
);

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  { 
    ssr: false, 
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
        <div className="flex items-center gap-2 text-sm text-studio-muted animate-pulse">
           <Sparkles className="h-4 w-4" />
           Loading Live Preview...
        </div>
      </div>
    ) 
  }
);

const HoloScriptEditor = dynamic(
  () => import('@/components/editor/HoloScriptEditor').then((m) => ({ default: m.HoloScriptEditor })),
  { 
    ssr: false, 
    loading: () => (
      <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
        <div className="flex items-center gap-2 text-sm text-studio-muted animate-pulse">
           <Code2 className="h-4 w-4" />
           Loading Code Editor...
        </div>
      </div>
    ) 
  }
);

export default function VibeCodingPage() {
  const [topHeight, setTopHeight] = useState(500);
  const r3fTree = useSceneStore((s) => s.r3fTree);

  return (
    <ResponsiveStudioLayout
      leftPanel={<BrittneyChatPanel />}
      leftTitle="Brittney AI (Vibe Coding Mode)"
    >
      <div className="flex flex-col h-full w-full bg-studio-bg overflow-hidden relative">
        {/* Top: Live Scene Preview */}
        <div 
          style={{ height: topHeight, minHeight: 200 }} 
          className="relative shrink-0 flex flex-col bg-[#0a0a12]"
        >
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 backdrop-blur shadow-md">
            <Sparkles className="h-4 w-4 text-studio-accent" />
            <span className="text-xs font-semibold text-studio-text tracking-wide whitespace-nowrap">
              LIVE PREVIEW
            </span>
          </div>
          
          <div className="flex-1 w-full h-full relative">
            <SceneRenderer r3fTree={r3fTree} />
          </div>
        </div>

        {/* Splitter */}
        <div className="relative z-20">
          <PanelSplitter
            direction="vertical"
            onDelta={(delta) => setTopHeight((prev) => Math.max(200, prev + delta))}
          />
        </div>

        {/* Bottom: Code Editor */}
        <div className="flex-1 relative overflow-hidden flex flex-col">
          <div className="absolute top-3 right-5 z-10 flex items-center gap-2 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 backdrop-blur shadow-md pointer-events-none">
            <Code2 className="h-4 w-4 text-blue-400" />
            <span className="text-xs font-semibold text-white/90">
              SYNTHESIZED CODE
            </span>
          </div>
          
          <div className="flex-1 w-full h-full">
            <HoloScriptEditor />
          </div>
        </div>
      </div>
    </ResponsiveStudioLayout>
  );
}
