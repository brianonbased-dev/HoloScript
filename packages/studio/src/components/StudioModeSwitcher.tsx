'use client';

import { Blocks, Paintbrush, Clapperboard, Settings2, Bone } from 'lucide-react';
import { useEditorStore } from '@/lib/store';
import type { StudioMode } from '@/lib/store';

const MODES: { id: StudioMode; label: string; icon: React.ReactNode; color: string }[] = [
  {
    id: 'creator',
    label: 'Creator',
    icon: <Blocks className="h-4 w-4" />,
    color: 'text-emerald-400',
  },
  {
    id: 'artist',
    label: 'Artist',
    icon: <Paintbrush className="h-4 w-4" />,
    color: 'text-violet-400',
  },
  {
    id: 'filmmaker',
    label: 'Filmmaker',
    icon: <Clapperboard className="h-4 w-4" />,
    color: 'text-amber-400',
  },
  {
    id: 'expert',
    label: 'Expert',
    icon: <Settings2 className="h-4 w-4" />,
    color: 'text-blue-400',
  },
  {
    id: 'character',
    label: 'Character',
    icon: <Bone className="h-4 w-4" />,
    color: 'text-purple-400',
  },
];

export function StudioModeSwitcher() {
  const { studioMode, setStudioMode } = useEditorStore();

  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-studio-border bg-studio-panel p-0.5">
      {MODES.map((mode) => {
        const active = studioMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => setStudioMode(mode.id)}
            title={`Switch to ${mode.label} mode`}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-all duration-150 ${
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
    </div>
  );
}
