'use client';

import { useState } from 'react';
import { Blocks, Paintbrush, Clapperboard, Settings2, Bone, FlaskConical, ChevronDown } from 'lucide-react';
import { useEditorStore } from '@/lib/store';
import type { StudioMode } from '@/lib/store';

interface ModeInfo {
  id: StudioMode;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  features: string[];
  level: 'beginner' | 'intermediate' | 'advanced';
}

const MODES: ModeInfo[] = [
  {
    id: 'creator',
    label: 'Creator',
    icon: <Blocks className="h-4 w-4" />,
    color: 'text-emerald-400',
    description: 'Build scenes with AI prompts and templates',
    features: ['AI chat', 'Templates', 'Drag & drop', 'Scene graph'],
    level: 'beginner',
  },
  {
    id: 'artist',
    label: 'Artist',
    icon: <Paintbrush className="h-4 w-4" />,
    color: 'text-violet-400',
    description: 'Sketch, paint, and texture your 3D world',
    features: ['Sketch tools', 'Paint mode', 'Material editor', 'Asset library'],
    level: 'intermediate',
  },
  {
    id: 'filmmaker',
    label: 'Filmmaker',
    icon: <Clapperboard className="h-4 w-4" />,
    color: 'text-amber-400',
    description: 'Animate, compose shots, and create cinematics',
    features: ['Timeline', 'Camera rigs', 'Keyframes', 'Post-processing'],
    level: 'intermediate',
  },
  {
    id: 'expert',
    label: 'Expert',
    icon: <Settings2 className="h-4 w-4" />,
    color: 'text-blue-400',
    description: 'Full access to code editor, shaders, and benchmarks',
    features: ['Code editor', 'Shader lab', 'Performance', 'Debug tools'],
    level: 'advanced',
  },
  {
    id: 'character',
    label: 'Character',
    icon: <Bone className="h-4 w-4" />,
    color: 'text-purple-400',
    description: 'Rig, animate, and test 3D characters',
    features: ['Skeleton view', 'Motion capture', 'Animation clips', 'GLB import'],
    level: 'advanced',
  },
  {
    id: 'scenarios',
    label: 'Scenarios',
    icon: <FlaskConical className="h-4 w-4" />,
    color: 'text-teal-400',
    description: 'Browse and launch 26 interactive scenario engines',
    features: ['Scenario gallery', 'Category filters', 'Search', 'Panel launcher'],
    level: 'beginner',
  },
];

const LEVEL_LABEL: Record<string, string> = {
  beginner: '🟢 Beginner',
  intermediate: '🟡 Intermediate',
  advanced: '🟠 Advanced',
};

export function StudioModeSwitcher() {
  const { studioMode, setStudioMode } = useEditorStore();
  const [expanded, setExpanded] = useState(false);
  const currentMode = MODES.find((m) => m.id === studioMode) ?? MODES[0];

  return (
    <div className="relative">
      {/* Compact mode — mode tabs */}
      <div className="flex items-center gap-0.5 rounded-lg border border-studio-border bg-studio-panel p-0.5">
        {MODES.map((mode) => {
          const active = studioMode === mode.id;
          return (
            <button
              key={mode.id}
              onClick={() => setStudioMode(mode.id)}
              title={`${mode.label}: ${mode.description}`}
              className={`studio-header-btn flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
                active
                  ? `bg-studio-border ${mode.color} shadow-sm`
                  : 'text-studio-muted hover:text-studio-text hover:bg-white/5'
              }`}
            >
              {mode.icon}
              <span className="hidden sm:inline">{mode.label}</span>
            </button>
          );
        })}
        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-0.5 flex items-center rounded-md px-1 py-1.5 text-studio-muted hover:text-studio-text transition"
          title="Mode details"
        >
          <ChevronDown className={`h-3 w-3 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Expanded dropdown — mode details */}
      {expanded && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 max-w-[90vw] rounded-xl border border-studio-border bg-studio-panel shadow-2xl shadow-black/30 z-50 overflow-hidden">
          <div className="p-3 space-y-1">
            {MODES.map((mode) => {
              const active = studioMode === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => { setStudioMode(mode.id); setExpanded(false); }}
                  className={`flex w-full items-start gap-2.5 rounded-lg p-2 text-left transition ${
                    active
                      ? 'bg-studio-accent/10 border border-studio-accent/30'
                      : 'hover:bg-studio-surface border border-transparent'
                  }`}
                >
                  <span className={`mt-0.5 ${active ? mode.color : 'text-studio-muted'}`}>{mode.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-semibold ${active ? 'text-studio-text' : 'text-studio-text/80'}`}>
                        {mode.label}
                      </span>
                      <span className="text-[8px] text-studio-muted">{LEVEL_LABEL[mode.level]}</span>
                    </div>
                    <p className="text-[9px] text-studio-muted mt-0.5">{mode.description}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {mode.features.map((f) => (
                        <span key={f} className="rounded bg-studio-border/60 px-1 py-0.5 text-[7px] text-studio-muted">
                          {f}
                        </span>
                      ))}
                    </div>
                  </div>
                  {active && <span className="text-studio-accent text-[10px] mt-0.5">●</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
