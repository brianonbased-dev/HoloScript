'use client';

/**
 * BuilderHotbar — Minecraft-style bottom toolbar for shape placement
 *
 * Features:
 *   - 8 geometry slots with visual thumbnails (keys 1-8)
 *   - Mode buttons: Place (P) / Break (X) / Select (V)
 *   - Grid snap toggle (G) + size selector
 *   - Active slot glowing highlight
 */

import { useEffect } from 'react';
import {
  useBuilderStore,
  type BuilderMode,
  type HotbarSlot,
} from '@/lib/stores/builderStore';

// ── Shape Icons ──────────────────────────────────────────────────────────────

const SHAPE_ICON: Record<string, string> = {
  cube:     '▣',
  sphere:   '●',
  cylinder: '⬮',
  cone:     '▲',
  torus:    '◎',
  capsule:  '⬬',
  plane:    '▬',
  ring:     '◌',
};

const MODE_CONFIG: { mode: BuilderMode; label: string; icon: string; key: string; color: string }[] = [
  { mode: 'place',  label: 'Place',  icon: '✚', key: 'P', color: 'text-green-400 border-green-500/40 bg-green-500/10' },
  { mode: 'break',  label: 'Break',  icon: '✕', key: 'X', color: 'text-red-400 border-red-500/40 bg-red-500/10' },
  { mode: 'select', label: 'Select', icon: '◇', key: 'V', color: 'text-blue-400 border-blue-500/40 bg-blue-500/10' },
];

// ── Slot Component ───────────────────────────────────────────────────────────

function HotbarSlotButton({
  slot,
  index,
  isActive,
  onSelect,
}: {
  slot: HotbarSlot;
  index: number;
  isActive: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={`
        relative flex flex-col items-center justify-center
        w-12 h-12 rounded-lg border transition-all duration-150
        ${isActive
          ? 'border-white/60 bg-white/10 shadow-[0_0_12px_rgba(255,255,255,0.2)] scale-110 z-10'
          : 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
        }
      `}
      title={`${slot.label} [${index + 1}]`}
    >
      {/* Shape icon with color */}
      <span
        className="text-lg leading-none"
        style={{ color: slot.color }}
      >
        {SHAPE_ICON[slot.geometry] || '■'}
      </span>

      {/* Label */}
      <span className="mt-0.5 text-[7px] font-medium text-white/40 uppercase tracking-wider">
        {slot.label}
      </span>

      {/* Key binding badge */}
      <span className={`
        absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5 items-center justify-center
        rounded text-[8px] font-bold
        ${isActive ? 'bg-white text-black' : 'bg-white/10 text-white/30'}
      `}>
        {index + 1}
      </span>

      {/* Color indicator dot */}
      <span
        className="absolute bottom-0.5 left-1/2 -translate-x-1/2 h-1 w-4 rounded-full"
        style={{ backgroundColor: slot.color }}
      />
    </button>
  );
}

// ── Main Hotbar ──────────────────────────────────────────────────────────────

export function BuilderHotbar() {
  const hotbarSlots = useBuilderStore((s) => s.hotbarSlots);
  const activeSlot = useBuilderStore((s) => s.activeSlot);
  const setActiveSlot = useBuilderStore((s) => s.setActiveSlot);
  const builderMode = useBuilderStore((s) => s.builderMode);
  const setBuilderMode = useBuilderStore((s) => s.setBuilderMode);
  const gridSnap = useBuilderStore((s) => s.gridSnap);
  const toggleGridSnap = useBuilderStore((s) => s.toggleGridSnap);
  const gridSize = useBuilderStore((s) => s.gridSize);
  const setGridSize = useBuilderStore((s) => s.setGridSize);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) return;

      // 1-8: select hotbar slot
      const num = parseInt(e.key);
      if (num >= 1 && num <= 8) {
        e.preventDefault();
        setActiveSlot(num - 1);
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'p':
          e.preventDefault();
          setBuilderMode('place');
          break;
        case 'x':
          e.preventDefault();
          setBuilderMode('break');
          break;
        case 'v':
          if (!e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            setBuilderMode('select');
          }
          break;
        case 'g':
          e.preventDefault();
          toggleGridSnap();
          break;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveSlot, setBuilderMode, toggleGridSnap]);

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-end gap-3">
      {/* Grid controls */}
      <div className="flex flex-col items-center gap-1 pb-0.5">
        <button
          onClick={toggleGridSnap}
          className={`
            rounded-lg border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition
            ${gridSnap
              ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300'
              : 'border-white/10 bg-white/[0.03] text-white/30 hover:text-white/50'
            }
          `}
          title="Toggle Grid Snap [G]"
        >
          ⊞ Grid
        </button>
        <select
          value={gridSize}
          onChange={(e) => setGridSize(parseFloat(e.target.value))}
          className="w-14 rounded border border-white/10 bg-white/[0.03] px-1 py-0.5 text-[8px] text-white/40 outline-none"
        >
          <option value={0.25}>0.25</option>
          <option value={0.5}>0.5</option>
          <option value={1.0}>1.0</option>
          <option value={2.0}>2.0</option>
        </select>
      </div>

      {/* Hotbar slots */}
      <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-black/70 px-2 py-2 backdrop-blur-xl shadow-2xl">
        {hotbarSlots.map((slot, i) => (
          <HotbarSlotButton
            key={i}
            slot={slot}
            index={i}
            isActive={i === activeSlot}
            onSelect={() => setActiveSlot(i)}
          />
        ))}
      </div>

      {/* Mode controls */}
      <div className="flex flex-col gap-1 pb-0.5">
        {MODE_CONFIG.map(({ mode, label, icon, key, color }) => (
          <button
            key={mode}
            onClick={() => setBuilderMode(mode)}
            className={`
              rounded-lg border px-2 py-1 text-[9px] font-semibold uppercase tracking-wider transition
              ${builderMode === mode
                ? color
                : 'border-white/10 bg-white/[0.03] text-white/30 hover:text-white/50'
              }
            `}
            title={`${label} Mode [${key}]`}
          >
            {icon} {label}
          </button>
        ))}
      </div>
    </div>
  );
}
