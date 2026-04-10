'use client';

/**
 * AudioVisualizerPanel — FFT visualizer with preset picker and @audio codegen.
 */

import { useEffect, useState } from 'react';
import { Music2, X, Play, Square, Copy, Plus } from 'lucide-react';
import { useAudioVisualizer, type VisualizerMode } from '@/hooks/useAudioVisualizer';
import { useSceneStore } from '@/lib/stores';
import { logger } from '@/lib/logger';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface AudioPreset {
  id: string;
  name: string;
  category: string;
  description: string;
  emoji: string;
  bpm: number;
  traitSnippet: string;
  waveform: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  ambient: '#4488ff',
  music: '#cc44ff',
  sfx: '#ff8844',
};

const MODES: { id: VisualizerMode; label: string }[] = [
  { id: 'bars', label: 'Bars' },
  { id: 'waveform', label: 'Wave' },
  { id: 'radial', label: 'Radial' },
];

interface AudioVisualizerPanelProps {
  onClose: () => void;
}

export function AudioVisualizerPanel({ onClose }: AudioVisualizerPanelProps) {
  const [presets, setPresets] = useState<AudioPreset[]>([]);
  const [selected, setSelected] = useState<AudioPreset | null>(null);
  const [copied, setCopied] = useState(false);
  const viz = useAudioVisualizer();
  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  useEffect(() => {
    fetch('/api/audio-presets')
      .then((r) => r.json())
      .then((d: { presets: AudioPreset[] }) => {
        setPresets(d.presets);
        if (d.presets[0]) setSelected(d.presets[0]);
      })
      .catch((err) => logger.warn('Swallowed error caught:', err));
  }, []);

  const insert = () => {
    if (!selected) return;
    setCode(
      code +
        `\nobject "${selected.name.replace(/\s+/g, '_')}_Audio" {\n${selected.traitSnippet}\n}\n`
    );
  };

  const copy = async () => {
    if (!selected) return;
    await navigator.clipboard.writeText(selected.traitSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Music2 className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Audio Visualizer</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Canvas */}
      <div className="relative shrink-0 border-b border-studio-border bg-[#0a0a12]">
        <canvas
          ref={viz.canvasRef as React.RefObject<HTMLCanvasElement>}
          width={288}
          height={120}
          className="w-full"
        />
        {!viz.isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[9px] text-studio-muted/60">Press play to visualize</p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2">
        {/* Play/Stop */}
        <button
          onClick={viz.isPlaying ? viz.stop : viz.play}
          className={`flex items-center gap-1 rounded-xl px-3 py-1.5 text-[9px] font-semibold transition ${viz.isPlaying ? 'bg-red-600/80 text-white hover:bg-red-600' : 'bg-studio-accent text-white hover:brightness-110'}`}
        >
          {viz.isPlaying ? (
            <>
              <Square className="h-3 w-3" /> Stop
            </>
          ) : (
            <>
              <Play className="h-3 w-3" /> Play Demo
            </>
          )}
        </button>

        {/* Mode pills */}
        <div className="flex gap-1 ml-auto">
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => viz.setMode(m.id)}
              className={`rounded-full border px-2 py-0.5 text-[8px] transition ${viz.mode === m.id ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* Gain slider */}
      <div className="shrink-0 border-b border-studio-border px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-studio-muted">Gain</span>
          <span className="font-mono text-[9px]">{viz.gain.toFixed(2)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={viz.gain}
          onChange={(e) => viz.setGain(Number(e.target.value))}
          className="w-full accent-studio-accent"
        />
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto space-y-1 p-2">
        {presets.map((p) => (
          <button
            key={p.id}
            onClick={() => setSelected(p)}
            className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left transition ${selected?.id === p.id ? 'border-studio-accent bg-studio-accent/10' : 'border-studio-border bg-studio-surface hover:border-studio-accent/40'}`}
          >
            <span className="text-base">{p.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold truncate">{p.name}</p>
              <p className="text-[8px] text-studio-muted truncate">{p.description}</p>
            </div>
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[7px]"
              style={{
                backgroundColor: `${CATEGORY_COLORS[p.category] ?? '#888'}22`,
                color: CATEGORY_COLORS[p.category] ?? '#888',
              }}
            >
              {p.category}
            </span>
          </button>
        ))}
      </div>

      {/* Selected snippet */}
      {selected && (
        <div className="shrink-0 border-t border-studio-border p-2">
          <pre className="text-[7.5px] text-studio-muted/80 overflow-x-auto bg-studio-surface/50 rounded-lg p-1.5 max-h-20 leading-relaxed">
            {selected.traitSnippet.trim()}
          </pre>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={insert}
              className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-1.5 text-[10px] font-semibold text-white hover:brightness-110"
            >
              <Plus className="h-3 w-3" /> Insert Object
            </button>
            <button
              onClick={copy}
              className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[9px] transition ${copied ? 'border-green-500/40 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
            >
              <Copy className="h-3 w-3" /> {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
