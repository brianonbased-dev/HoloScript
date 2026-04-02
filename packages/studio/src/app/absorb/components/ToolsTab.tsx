'use client';

import React, { useState, useCallback } from 'react';

type QualityTierOption = 'low' | 'medium' | 'high' | 'ultra';

const QUALITY_TIER_DESCRIPTIONS: Record<QualityTierOption, { label: string; desc: string }> = {
  low: { label: 'Low', desc: 'Minimal particles, basic LOD, no shadows. Best for quick previews.' },
  medium: { label: 'Medium', desc: 'Balanced quality. Good for development and iteration.' },
  high: { label: 'High', desc: 'Full particles, detailed LOD, shadow maps. Production quality.' },
  ultra: {
    label: 'Ultra',
    desc: 'Maximum fidelity -- all effects, highest resolution. GPU-intensive.',
  },
};

interface ToolsTabProps {
  projects: { id: string; name: string }[];
  activeProjectId: string | null;
  qualityTier: QualityTierOption;
  onSetQualityTier: (tier: QualityTierOption) => void;
  onQuery: (
    projectId: string,
    query: string,
    withLLM?: boolean
  ) => Promise<{ success: boolean; data: Record<string, unknown> }>;
  onRender: (
    projectId: string,
    format: 'png' | 'jpeg' | 'webp' | 'pdf',
    options?: { width?: number; height?: number; quality?: number }
  ) => Promise<{ success: boolean; data: Record<string, unknown> }>;
  onDiff: (
    projectId: string,
    sourceA: string,
    sourceB: string
  ) => Promise<{ success: boolean; data: Record<string, unknown> }>;
}

export function ToolsTab({
  projects,
  activeProjectId,
  qualityTier,
  onSetQualityTier,
  onQuery,
  onRender,
  onDiff,
}: ToolsTabProps) {
  const [selectedProject, setSelectedProject] = useState(activeProjectId || projects[0]?.id || '');

  // Query state
  const [queryText, setQueryText] = useState('');
  const [withLLM, setWithLLM] = useState(false);
  const [queryResult, setQueryResult] = useState<Record<string, unknown> | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  // Render state
  const [renderFormat, setRenderFormat] = useState<'png' | 'jpeg' | 'webp' | 'pdf'>('png');
  const [renderWidth, setRenderWidth] = useState(1280);
  const [renderHeight, setRenderHeight] = useState(720);
  const [renderResult, setRenderResult] = useState<Record<string, unknown> | null>(null);
  const [renderLoading, setRenderLoading] = useState(false);

  // Diff state
  const [sourceA, setSourceA] = useState('');
  const [sourceB, setSourceB] = useState('');
  const [diffResult, setDiffResult] = useState<Record<string, unknown> | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const handleQuery = useCallback(async () => {
    if (!selectedProject || !queryText.trim()) return;
    setQueryLoading(true);
    const res = await onQuery(selectedProject, queryText, withLLM);
    setQueryResult(res.data);
    setQueryLoading(false);
  }, [selectedProject, queryText, withLLM, onQuery]);

  const handleRender = useCallback(async () => {
    if (!selectedProject) return;
    setRenderLoading(true);
    const res = await onRender(selectedProject, renderFormat, {
      width: renderWidth,
      height: renderHeight,
    });
    setRenderResult(res.data);
    setRenderLoading(false);
  }, [selectedProject, renderFormat, renderWidth, renderHeight, onRender]);

  const handleDiff = useCallback(async () => {
    if (!selectedProject || !sourceA.trim() || !sourceB.trim()) return;
    setDiffLoading(true);
    const res = await onDiff(selectedProject, sourceA, sourceB);
    setDiffResult(res.data);
    setDiffLoading(false);
  }, [selectedProject, sourceA, sourceB, onDiff]);

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-studio-muted">Create a project first to use tools.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      {/* Project Selector */}
      <div className="flex items-center gap-4">
        <label className="text-xs font-medium text-studio-muted">Project:</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Quality Tier Selector */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Quality Tier</h3>
          <span className="text-[10px] text-emerald-400 font-medium">
            Free -- applies to all operations
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            Object.entries(QUALITY_TIER_DESCRIPTIONS) as [
              QualityTierOption,
              { label: string; desc: string },
            ][]
          ).map(([key, info]) => (
            <button
              key={key}
              onClick={() => onSetQualityTier(key)}
              className={`rounded-lg border p-3 text-left transition-all ${
                qualityTier === key
                  ? 'border-studio-accent bg-studio-accent/10'
                  : 'border-studio-border hover:border-studio-accent/40'
              }`}
            >
              <div className="text-xs font-semibold text-studio-text">{info.label}</div>
              <div className="mt-1 text-[10px] text-studio-muted">{info.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Codebase Query */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Codebase Query</h3>
          <span className="text-[10px] text-studio-muted">
            {withLLM ? '~15+ credits (AI-powered)' : '5 credits'}
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search your codebase... e.g. 'how does authentication work?'"
              onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
              className="flex-1 rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none"
            />
            <button
              onClick={handleQuery}
              disabled={queryLoading || !queryText.trim()}
              className="shrink-0 rounded-lg bg-studio-accent px-4 py-2 text-sm font-medium text-white hover:bg-studio-accent/80 disabled:opacity-50"
            >
              {queryLoading ? 'Searching...' : 'Search'}
            </button>
          </div>
          <label className="flex items-center gap-2 text-xs text-studio-muted">
            <input
              type="checkbox"
              checked={withLLM}
              onChange={(e) => setWithLLM(e.target.checked)}
              className="rounded border-studio-border"
            />
            Use AI synthesis (generates a natural language answer -- costs more)
          </label>
          {queryResult && (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-studio-border bg-[#0f172a] p-3">
              <pre className="whitespace-pre-wrap text-[11px] text-studio-muted">
                {JSON.stringify(queryResult, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Render Export */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Export / Render</h3>
          <span className="text-[10px] text-studio-muted">
            {renderFormat === 'pdf' ? '5 credits' : '3 credits'}
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-medium text-studio-muted">
            Format
            <select
              value={renderFormat}
              onChange={(e) => setRenderFormat(e.target.value as typeof renderFormat)}
              className="mt-1 block rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
            >
              <option value="png">PNG</option>
              <option value="jpeg">JPEG</option>
              <option value="webp">WebP</option>
              <option value="pdf">PDF</option>
            </select>
          </label>
          <label className="text-xs font-medium text-studio-muted">
            Width
            <input
              type="number"
              value={renderWidth}
              onChange={(e) => setRenderWidth(Number(e.target.value))}
              min={320}
              max={3840}
              step={10}
              className="mt-1 block w-24 rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
            />
          </label>
          <label className="text-xs font-medium text-studio-muted">
            Height
            <input
              type="number"
              value={renderHeight}
              onChange={(e) => setRenderHeight(Number(e.target.value))}
              min={240}
              max={2160}
              step={10}
              className="mt-1 block w-24 rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-sm text-studio-text focus:border-studio-accent focus:outline-none"
            />
          </label>
          <button
            onClick={handleRender}
            disabled={renderLoading}
            className="rounded-lg bg-blue-500/20 px-4 py-2 text-sm font-medium text-blue-300 hover:bg-blue-500/30 disabled:opacity-50"
          >
            {renderLoading ? 'Rendering...' : 'Render'}
          </button>
        </div>
        {renderResult && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-studio-border bg-[#0f172a] p-3">
            <pre className="whitespace-pre-wrap text-[11px] text-studio-muted">
              {JSON.stringify(renderResult, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Semantic Diff */}
      <div className="rounded-xl border border-studio-border bg-[#111827] p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-studio-text">Semantic Diff</h3>
          <span className="text-[10px] text-studio-muted">2 credits</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-medium text-studio-muted">
            Source A
            <textarea
              value={sourceA}
              onChange={(e) => setSourceA(e.target.value)}
              placeholder="Paste the original source code..."
              rows={6}
              className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-xs font-mono text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-none"
            />
          </label>
          <label className="text-xs font-medium text-studio-muted">
            Source B
            <textarea
              value={sourceB}
              onChange={(e) => setSourceB(e.target.value)}
              placeholder="Paste the updated source code..."
              rows={6}
              className="mt-1 block w-full rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2 text-xs font-mono text-studio-text placeholder:text-studio-muted/50 focus:border-studio-accent focus:outline-none resize-none"
            />
          </label>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleDiff}
            disabled={diffLoading || !sourceA.trim() || !sourceB.trim()}
            className="rounded-lg bg-emerald-500/20 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {diffLoading ? 'Comparing...' : 'Compare'}
          </button>
        </div>
        {diffResult && (
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-studio-border bg-[#0f172a] p-3">
            <pre className="whitespace-pre-wrap text-[11px] text-studio-muted">
              {JSON.stringify(diffResult, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
