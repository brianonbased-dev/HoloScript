'use client';

/**
 * ExpressionPanel — Emotion & Viseme preset selector
 *
 * Displays emotion presets (Happy, Sad, Angry, etc.) and viseme
 * presets (AA, EE, OH, etc.) as clickable cards. Applies the preset
 * weights to the character store with an intensity slider.
 */

import { useState } from 'react';
import { useCharacterStore } from '@/lib/stores';
import {
  EMOTION_PRESETS,
  VISEME_PRESETS,
  applyPresetWeights,
  type ExpressionPreset,
} from '@/lib/ExpressionPresets';
import { Smile, Mic } from 'lucide-react';

// ── Expression card ─────────────────────────────────────────────────────────

function ExpressionCard({
  preset,
  isActive,
  intensity,
  onSelect,
}: {
  preset: ExpressionPreset;
  isActive: boolean;
  intensity: number;
  onSelect: (preset: ExpressionPreset) => void;
}) {
  return (
    <button
      onClick={() => onSelect(preset)}
      className={`flex flex-col items-center gap-0.5 rounded-lg border p-2 transition ${
        isActive
          ? 'border-purple-500 bg-purple-500/10 text-purple-300 scale-105'
          : 'border-studio-border bg-black/10 text-studio-muted hover:border-purple-500/40 hover:text-studio-text'
      }`}
      title={preset.name}
    >
      <span className="text-lg">{preset.emoji}</span>
      <span className="text-[9px] font-medium">{preset.name}</span>
    </button>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────────

type Tab = 'emotions' | 'visemes';

export function ExpressionPanel() {
  const [tab, setTab] = useState<Tab>('emotions');
  const [activePreset, setActivePreset] = useState<string | null>(null);
  const [intensity, setIntensity] = useState(100);
  const glbUrl = useCharacterStore((s) => s.glbUrl);
  const setMorphTarget = useCharacterStore((s) => s.setMorphTarget);
  const morphTargets = useCharacterStore((s) => s.morphTargets);

  const handleSelect = (preset: ExpressionPreset) => {
    setActivePreset(preset.id);
    applyPresetWeights(preset, setMorphTarget, intensity / 100, morphTargets);
  };

  const presets = tab === 'emotions' ? EMOTION_PRESETS : VISEME_PRESETS;

  if (!glbUrl) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 p-4 text-center">
        <span className="text-3xl">🎭</span>
        <p className="text-xs text-studio-muted">Load a model to use expressions</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* Tabs */}
      <div className="flex border-b border-studio-border">
        <button
          onClick={() => setTab('emotions')}
          className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition ${
            tab === 'emotions'
              ? 'border-b-2 border-purple-500 text-purple-400'
              : 'text-studio-muted hover:text-studio-text'
          }`}
        >
          <Smile className="h-3 w-3" /> Emotions
        </button>
        <button
          onClick={() => setTab('visemes')}
          className={`flex flex-1 items-center justify-center gap-1 py-1.5 text-[10px] font-medium transition ${
            tab === 'visemes'
              ? 'border-b-2 border-purple-500 text-purple-400'
              : 'text-studio-muted hover:text-studio-text'
          }`}
        >
          <Mic className="h-3 w-3" /> Visemes
        </button>
      </div>

      {/* Intensity slider */}
      <div className="flex items-center gap-2 px-1">
        <span className="text-[9px] text-studio-muted w-12">Intensity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={intensity}
          onChange={(e) => setIntensity(Number(e.target.value))}
          className="flex-1 h-1 appearance-none rounded-full bg-white/10 accent-purple-500 cursor-pointer"
          aria-label="Expression intensity"
        />
        <span className="text-[9px] font-mono text-studio-muted w-6 text-right">{intensity}%</span>
      </div>

      {/* Preset grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {presets.map((p) => (
          <ExpressionCard
            key={p.id}
            preset={p}
            isActive={activePreset === p.id}
            intensity={intensity}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
