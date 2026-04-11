'use client';

import React, { _useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import { StudioHeader } from '@/components/StudioHeader';
import { SceneGraphPanel } from '@/components/scene/SceneGraphPanel';
import { ExportPipelinePanel } from '@/components/export/ExportPipelinePanel';
import { ErrorBoundary as StudioErrorBoundary } from '@holoscript/ui';
import { _Layers, Settings, Box, Activity, GripVertical } from 'lucide-react';
import dynamic from 'next/dynamic';

function PanelSplitter({
  onDrag,
  orientation = 'vertical',
}: {
  onDrag: (delta: number) => void;
  orientation?: 'vertical' | 'horizontal';
}) {
  const isDragging = React.useRef(false);
  const lastPos = React.useRef(0);

  const onMouseDown = React.useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      lastPos.current = orientation === 'vertical' ? e.clientX : e.clientY;

      const onMouseMove = (e: MouseEvent) => {
        if (!isDragging.current) return;
        const pos = orientation === 'vertical' ? e.clientX : e.clientY;
        const delta = pos - lastPos.current;
        lastPos.current = pos;
        onDrag(delta);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      };

      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    },
    [onDrag, orientation]
  );

  const isVertical = orientation === 'vertical';

  return (
    <div
      className={`flex items-center justify-center shrink-0 transition bg-studio-border/50 ${
        isVertical
          ? 'w-1.5 cursor-col-resize hover:bg-studio-accent/20'
          : 'h-1.5 cursor-row-resize hover:bg-studio-accent/20'
      }`}
      onMouseDown={onMouseDown}
    >
      <GripVertical className={`h-3 w-3 text-studio-muted/40 ${isVertical ? '' : 'rotate-90'}`} />
    </div>
  );
}

const SceneRenderer = dynamic(
  () => import('@/components/scene/SceneRenderer').then((m) => ({ default: m.SceneRenderer })),
  { ssr: false, loading: () => <ViewportSkeleton /> }
);

function ViewportSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-[#0a0a12]">
      <div className="text-sm text-studio-muted animate-pulse">Loading Custom Tools…</div>
    </div>
  );
}

// Map defining specific industry templates/configurations
const V_CONFIG: Record<string, { title: string; desc: string }> = {
  healthcare: {
    title: 'Medical Simulation',
    desc: 'DICOM import, anatomical materials, compliance',
  },
  architecture: { title: 'Architectural Viz', desc: 'BIM import, lighting, measurement tools' },
  gaming: { title: 'Game Development', desc: 'Level design, optimized export, navmesh' },
  film: { title: 'Virtual Production', desc: 'Camera sequence, DMX, live data sync' },
  manufacturing: { title: 'Digital Twin', desc: 'CAD import, physics simulation, SCADA sync' },
};

export default function IndustryPortalPage() {
  const params = useParams();
  const vertical = typeof params.vertical === 'string' ? params.vertical : 'industry';
  const config = V_CONFIG[vertical] || {
    title: 'Professional Environment',
    desc: 'Tailored workflow tools',
  };

  // Use a targeted composition if it exists, otherwise fallback to a generic industry header
  const composition = useHoloComposition(`/api/surface/industry/${vertical}`);

  const [leftPanelW, setLeftPanelW] = useState(300);
  const [rightPanelW, setRightPanelW] = useState(300);

  return (
    <div className="flex h-full flex-col bg-studio-bg text-studio-text">
      <StudioHeader />

      {/* ── Industry Portal Native Header (HoloClaw Pattern) ── */}
      <div className="h-16 border-b border-studio-border bg-studio-panel/50 px-4 flex items-center justify-between">
        <div className="flex flex-col">
          <h2 className="text-sm font-semibold text-studio-accent">{config.title}</h2>
          <span className="text-xs text-studio-muted">{config.desc}</span>
        </div>
        {!composition.loading && !composition.error && (
          <div className="h-full w-64">
            <HoloSurfaceRenderer
              nodes={composition.nodes}
              state={composition.state}
              computed={composition.computed}
              templates={composition.templates}
              onEmit={composition.emit}
            />
          </div>
        )}
      </div>

      {/* ── Professional Workspace Matrix ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Side: Domain-Specific Graph */}
        <div
          style={{ width: leftPanelW }}
          className="flex flex-col border-r border-studio-border bg-studio-panel"
        >
          <div className="flex h-10 items-center justify-between border-b border-studio-border px-3 bg-studio-surface">
            <span className="flex items-center gap-2 text-xs font-semibold text-studio-muted uppercase tracking-wider">
              <Box className="h-3.5 w-3.5" /> Domain Hierarchy
            </span>
          </div>
          <div className="flex-1 overflow-auto opacity-70">
            <StudioErrorBoundary label="Domain Hierarchy">
              <SceneGraphPanel />
            </StudioErrorBoundary>
          </div>
        </div>
        <PanelSplitter
          orientation="vertical"
          onDrag={(d) => setLeftPanelW((p) => Math.max(200, p + d))}
        />

        {/* Center: Specialized Render View Context */}
        <div className="relative flex flex-1 flex-col overflow-hidden bg-[#0A0A10]">
          <StudioErrorBoundary label="Industry Viewport">
            <SceneRenderer r3fTree={{ type: 'group', props: {} }} profilerOpen={false} />
          </StudioErrorBoundary>

          <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-lg border border-studio-border/60 bg-studio-panel/90 px-3 py-1.5 text-xs text-studio-muted backdrop-blur">
            <Activity className="h-3.5 w-3.5 text-studio-accent" />
            {config.title} Active Context
          </div>
        </div>
        <PanelSplitter
          orientation="vertical"
          onDrag={(d) => setRightPanelW((p) => Math.max(200, p - d))}
        />

        {/* Right Side: Professional Pipelines */}
        <div
          style={{ width: rightPanelW }}
          className="flex flex-col border-l border-studio-border bg-studio-panel"
        >
          <div className="flex h-10 items-center justify-between border-b border-studio-border px-3 bg-studio-surface">
            <span className="flex items-center gap-2 text-xs font-semibold text-studio-muted uppercase tracking-wider">
              <Settings className="h-3.5 w-3.5" /> Vertical Settings
            </span>
          </div>
          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="rounded-lg border border-studio-border bg-studio-bg p-3">
              <h3 className="text-xs font-semibold mb-2 flex justify-between">
                Asset Constraints
                <span className="text-studio-accent text-[10px]">Strict</span>
              </h3>
              <p className="text-[11px] text-studio-muted">
                Domain rules for {vertical} are being actively enforced.
              </p>
            </div>

            {/* Tailored Export specific for professionals */}
            <div className="opacity-90">
              <StudioErrorBoundary label="Export Pipeline">
                <ExportPipelinePanel onClose={() => {}} />
              </StudioErrorBoundary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
