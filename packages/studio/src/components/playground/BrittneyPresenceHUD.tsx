'use client';

import { useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, Wrench, Play } from 'lucide-react';

type BrittneyStatus = 'idle' | 'observing' | 'testing' | 'found_issue' | 'fixed';

const STATUS_LABEL: Record<BrittneyStatus, string> = {
  idle: 'Idle',
  observing: 'Observing',
  testing: 'Testing',
  found_issue: 'Found issue',
  fixed: 'Fixed',
};

const STATUS_COLOR: Record<BrittneyStatus, string> = {
  idle: 'bg-gray-500',
  observing: 'bg-blue-500',
  testing: 'bg-yellow-500',
  found_issue: 'bg-red-500',
  fixed: 'bg-green-500',
};

interface BrittneyPresenceHUDProps {
  status?: BrittneyStatus;
  speech?: string;
  onTest?: () => void;
  onFix?: () => void;
}

export function BrittneyPresenceHUD({
  status = 'observing',
  speech = "I'm here. Drop a scene in Vibe and I'll test it from inside.",
  onTest,
  onFix,
}: BrittneyPresenceHUDProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute bottom-5 left-5 z-30 w-72 rounded-xl border border-purple-500/30 bg-[#0d0d1a]/90 shadow-2xl shadow-purple-900/20 backdrop-blur-md">
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 py-2.5 border-b border-purple-500/20">
        {/* Avatar portrait — placeholder circle, replaced with photo texture */}
        <div className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-purple-400 to-violet-700 flex items-center justify-center shadow">
          <Sparkles className="h-4 w-4 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-white">Brittney</span>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_COLOR[status]}`} />
            <span className="text-[10px] text-purple-300">{STATUS_LABEL[status]}</span>
          </div>
          <span className="text-[10px] text-purple-400/60">Embodied agent</span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="shrink-0 rounded p-0.5 text-purple-400 hover:text-white transition"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Speech */}
          <div className="px-3 py-2.5 text-xs text-purple-100/80 leading-relaxed min-h-[3rem]">
            {speech}
          </div>

          {/* Actions */}
          <div className="flex gap-2 px-3 pb-3">
            <button
              type="button"
              onClick={onTest}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-700/40 hover:bg-purple-700/60 border border-purple-500/30 px-2 py-1.5 text-[11px] font-medium text-purple-200 transition"
            >
              <Play className="h-3 w-3" />
              Test scene
            </button>
            <button
              type="button"
              onClick={onFix}
              disabled={status !== 'found_issue'}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-purple-700/40 hover:bg-purple-700/60 border border-purple-500/30 px-2 py-1.5 text-[11px] font-medium text-purple-200 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Wrench className="h-3 w-3" />
              Fix all
            </button>
          </div>
        </>
      )}
    </div>
  );
}
