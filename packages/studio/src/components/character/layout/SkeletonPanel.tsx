'use client';

import { useCharacterStore } from '@/lib/stores';
import { Eye, EyeOff, RotateCcw, ChevronRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';

// Infer bone role from its name for color-coding
function getBoneCategory(
  name: string
): 'spine' | 'arm' | 'leg' | 'head' | 'hand' | 'foot' | 'other' {
  const n = name.toLowerCase();
  if (n.includes('spine') || n.includes('hip') || n.includes('pelvis') || n.includes('chest'))
    return 'spine';
  if (
    n.includes('shoulder') ||
    n.includes('upper_arm') ||
    n.includes('lower_arm') ||
    n.includes('forearm') ||
    n.includes('arm')
  )
    return 'arm';
  if (
    n.includes('thigh') ||
    n.includes('shin') ||
    n.includes('knee') ||
    n.includes('calf') ||
    n.includes('leg')
  )
    return 'leg';
  if (n.includes('head') || n.includes('neck') || n.includes('jaw')) return 'head';
  if (
    n.includes('hand') ||
    n.includes('finger') ||
    n.includes('thumb') ||
    n.includes('index') ||
    n.includes('middle') ||
    n.includes('ring') ||
    n.includes('pinky')
  )
    return 'hand';
  if (n.includes('foot') || n.includes('toe') || n.includes('ankle')) return 'foot';
  return 'other';
}

const CATEGORY_EMOJI: Record<string, string> = {
  spine: '🦴',
  arm: '💪',
  leg: '🦵',
  head: '😶',
  hand: '🤚',
  foot: '🦶',
  other: '•',
};

const CATEGORY_COLOR: Record<string, string> = {
  spine: 'text-amber-400',
  arm: 'text-blue-400',
  leg: 'text-emerald-400',
  head: 'text-purple-400',
  hand: 'text-sky-400',
  foot: 'text-orange-400',
  other: 'text-studio-muted',
};

export function SkeletonPanel() {
  const boneNames = useCharacterStore((s) => s.boneNames);
  const selectedBoneIndex = useCharacterStore((s) => s.selectedBoneIndex);
  const setSelectedBoneIndex = useCharacterStore((s) => s.setSelectedBoneIndex);
  const showSkeleton = useCharacterStore((s) => s.showSkeleton);
  const setShowSkeleton = useCharacterStore((s) => s.setShowSkeleton);
  const glbUrl = useCharacterStore((s) => s.glbUrl);
  const setGlbUrl = useCharacterStore((s) => s.setGlbUrl);

  const [filter, setFilter] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const categories = ['spine', 'head', 'arm', 'hand', 'leg', 'foot', 'other'];

  const bonesByCategory = categories.reduce<Record<string, { name: string; index: number }[]>>(
    (acc, cat) => {
      acc[cat] = boneNames
        .map((name, index) => ({ name, index }))
        .filter(
          ({ name }) =>
            getBoneCategory(name) === cat && name.toLowerCase().includes(filter.toLowerCase())
        );
      return acc;
    },
    {} as Record<string, { name: string; index: number }[]>
  );

  const toggleCollapse = (cat: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-studio-border bg-studio-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <p className="text-xs font-semibold text-studio-text">Skeleton</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowSkeleton(!showSkeleton)}
            title={showSkeleton ? 'Hide skeleton' : 'Show skeleton'}
            className={`rounded p-1 transition ${showSkeleton ? 'text-purple-400 hover:text-purple-300' : 'text-studio-muted hover:text-studio-text'}`}
          >
            {showSkeleton ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          {glbUrl && (
            <button
              onClick={() => setGlbUrl(null)}
              title="Unload model"
              className="rounded p-1 text-studio-muted hover:text-red-400 transition"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-studio-border p-2">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter bones…"
          className="w-full rounded-lg bg-black/20 px-2.5 py-1 text-xs text-studio-text placeholder:text-studio-muted outline-none focus:ring-1 focus:ring-purple-500/40"
        />
      </div>

      {boneNames.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <span className="text-3xl">🦴</span>
          <p className="text-xs text-studio-muted">Load a .glb model to see its bones here</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto">
          {categories.map((cat) => {
            const bones = bonesByCategory[cat];
            if (!bones.length) return null;
            const isCollapsed = collapsed.has(cat);
            return (
              <div key={cat}>
                <button
                  onClick={() => toggleCollapse(cat)}
                  className="flex w-full items-center gap-1.5 px-2.5 py-1 text-left transition hover:bg-white/5"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3 w-3 text-studio-muted" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-studio-muted" />
                  )}
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wide ${CATEGORY_COLOR[cat]}`}
                  >
                    {CATEGORY_EMOJI[cat]} {cat} ({bones.length})
                  </span>
                </button>
                {!isCollapsed &&
                  bones.map(({ name, index }) => (
                    <button
                      key={index}
                      onClick={() =>
                        setSelectedBoneIndex(selectedBoneIndex === index ? null : index)
                      }
                      className={`flex w-full items-center gap-2 py-1 pl-7 pr-2 text-left text-xs transition ${
                        selectedBoneIndex === index
                          ? 'bg-purple-500/15 text-purple-300'
                          : 'text-studio-muted hover:bg-white/5 hover:text-studio-text'
                      }`}
                    >
                      <span className={`shrink-0 text-[10px] ${CATEGORY_COLOR[cat]}`}>●</span>
                      <span className="truncate font-mono text-[10px]">{name}</span>
                      {selectedBoneIndex === index && (
                        <span className="ml-auto shrink-0 text-[9px] text-purple-400">FK</span>
                      )}
                    </button>
                  ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Selected bone info */}
      {selectedBoneIndex !== null && (
        <div className="border-t border-studio-border p-3">
          <p className="text-[10px] text-studio-muted">Selected</p>
          <p className="truncate text-xs font-mono font-semibold text-purple-400">
            {boneNames[selectedBoneIndex] ?? `Bone #${selectedBoneIndex}`}
          </p>
          <p className="mt-0.5 text-[10px] text-studio-muted">
            Drag the gizmo in the viewport to rotate this bone (FK)
          </p>
          <button
            onClick={() => setSelectedBoneIndex(null)}
            className="mt-2 w-full rounded-lg border border-studio-border py-1 text-[10px] text-studio-muted transition hover:text-studio-text"
          >
            Deselect
          </button>
        </div>
      )}
    </div>
  );
}
