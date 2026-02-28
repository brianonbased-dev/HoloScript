'use client';

/**
 * CharacterCustomizer — Body & Face morph target sliders
 *
 * Two-tab panel with real-time slider controls for body proportions
 * and facial features. Drives morph target weights in the character store.
 */

import { useState, useCallback } from 'react';
import { useCharacterStore } from '@/lib/store';
import { RotateCcw, User, Smile } from 'lucide-react';

// ── Slider definitions ──────────────────────────────────────────────────────

interface SliderDef {
  id: string;
  label: string;
  emoji: string;
  min?: number;
  max?: number;
  default?: number;
}

const BODY_SLIDERS: SliderDef[] = [
  { id: 'body_height',     label: 'Height',     emoji: '📏' },
  { id: 'body_build',      label: 'Build',      emoji: '💪' },
  { id: 'body_shoulders',  label: 'Shoulders',  emoji: '🔲' },
  { id: 'body_chest',      label: 'Chest',      emoji: '🫁' },
  { id: 'body_waist',      label: 'Waist',      emoji: '⏳' },
  { id: 'body_hips',       label: 'Hips',       emoji: '🦴' },
  { id: 'body_arms',       label: 'Arm Length',  emoji: '🤲' },
  { id: 'body_legs',       label: 'Leg Length',  emoji: '🦵' },
];

const FACE_SLIDERS: SliderDef[] = [
  { id: 'face_eye_size',     label: 'Eye Size',     emoji: '👁️' },
  { id: 'face_eye_spacing',  label: 'Eye Spacing',  emoji: '↔️' },
  { id: 'face_nose_width',   label: 'Nose Width',   emoji: '👃' },
  { id: 'face_nose_length',  label: 'Nose Length',   emoji: '📐' },
  { id: 'face_mouth_width',  label: 'Mouth Width',  emoji: '👄' },
  { id: 'face_jaw_width',    label: 'Jaw Width',    emoji: '🦷' },
  { id: 'face_cheek',        label: 'Cheek',        emoji: '😊' },
  { id: 'face_brow',         label: 'Brow Height',  emoji: '🤨' },
];

// ── Morph Slider Component ──────────────────────────────────────────────────

function MorphSlider({ def }: { def: SliderDef }) {
  const value = useCharacterStore((s) => s.morphTargets[def.id] ?? 50);
  const setMorphTarget = useCharacterStore((s) => s.setMorphTarget);

  return (
    <div className="group flex items-center gap-2 px-3 py-1">
      <span className="w-4 text-center text-xs">{def.emoji}</span>
      <span className="w-20 truncate text-[10px] text-studio-muted group-hover:text-studio-text transition">
        {def.label}
      </span>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => setMorphTarget(def.id, Number(e.target.value))}
        className="flex-1 h-1 appearance-none rounded-full bg-white/10 accent-purple-500 cursor-pointer
                   [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-400
                   [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:shadow-md
                   [&::-webkit-slider-thumb]:transition [&::-webkit-slider-thumb]:hover:bg-purple-300"
        aria-label={def.label}
      />
      <span className="w-7 text-right text-[10px] font-mono text-studio-muted">{value}</span>
    </div>
  );
}

// ── Main Panel ──────────────────────────────────────────────────────────────

type Tab = 'body' | 'face';

export function CharacterCustomizer() {
  const [tab, setTab] = useState<Tab>('body');
  const skinColor = useCharacterStore((s) => s.skinColor);
  const setSkinColor = useCharacterStore((s) => s.setSkinColor);
  const resetMorphTargets = useCharacterStore((s) => s.resetMorphTargets);
  const glbUrl = useCharacterStore((s) => s.glbUrl);

  const handleResetCategory = useCallback(() => {
    const sliders = tab === 'body' ? BODY_SLIDERS : FACE_SLIDERS;
    const store = useCharacterStore.getState();
    const updated = { ...store.morphTargets };
    sliders.forEach((s) => { updated[s.id] = 50; });
    useCharacterStore.setState({ morphTargets: updated });
  }, [tab]);

  const sliders = tab === 'body' ? BODY_SLIDERS : FACE_SLIDERS;

  return (
    <div className="flex h-full w-56 shrink-0 flex-col border-r border-studio-border bg-studio-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <p className="text-xs font-semibold text-studio-text">Customize</p>
        <div className="flex items-center gap-1">
          <button
            onClick={handleResetCategory}
            title={`Reset ${tab} sliders`}
            className="rounded p-1 text-studio-muted hover:text-amber-400 transition"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-studio-border">
        <button
          onClick={() => setTab('body')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition ${
            tab === 'body'
              ? 'border-b-2 border-purple-500 text-purple-400'
              : 'text-studio-muted hover:text-studio-text'
          }`}
        >
          <User className="h-3 w-3" /> Body
        </button>
        <button
          onClick={() => setTab('face')}
          className={`flex flex-1 items-center justify-center gap-1.5 py-2 text-xs font-medium transition ${
            tab === 'face'
              ? 'border-b-2 border-purple-500 text-purple-400'
              : 'text-studio-muted hover:text-studio-text'
          }`}
        >
          <Smile className="h-3 w-3" /> Face
        </button>
      </div>

      {/* Sliders */}
      {!glbUrl ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-4 text-center">
          <span className="text-3xl">🎭</span>
          <p className="text-xs text-studio-muted">Load a character model to start customizing</p>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto py-2">
          {sliders.map((def) => (
            <MorphSlider key={def.id} def={def} />
          ))}
        </div>
      )}

      {/* Skin Color */}
      {glbUrl && (
        <div className="border-t border-studio-border p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-studio-muted">Skin</span>
            <input
              type="color"
              value={skinColor}
              onChange={(e) => setSkinColor(e.target.value)}
              className="h-6 w-6 cursor-pointer rounded border border-studio-border bg-transparent"
              aria-label="Skin color"
            />
            <span className="text-[10px] font-mono text-studio-muted">{skinColor}</span>
          </div>
        </div>
      )}

      {/* Reset All */}
      {glbUrl && (
        <div className="border-t border-studio-border p-2">
          <button
            onClick={resetMorphTargets}
            className="w-full rounded-lg border border-studio-border py-1.5 text-[10px] text-studio-muted transition hover:border-red-400/40 hover:text-red-400"
          >
            Reset All Customization
          </button>
        </div>
      )}
    </div>
  );
}
