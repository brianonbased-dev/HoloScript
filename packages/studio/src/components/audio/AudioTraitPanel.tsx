'use client';

/**
 * AudioTraitPanel — right-rail audio preset browser and scene audio configurator.
 */

import { useState, useEffect, useCallback } from 'react';
import { Music, X, Search, Volume2, Radio, MapPin, Copy, Check } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import { logger } from '@/lib/logger';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';

type AudioType = 'ambient' | 'triggered' | 'spatial';

interface AudioPreset {
  id: string;
  name: string;
  type: AudioType;
  tags: string[];
  description: string;
  loop: boolean;
  volume: number;
  spatialRadius?: number;
  traitSnippet: string;
}

const TYPE_ICONS: Record<AudioType, React.ReactNode> = {
  ambient: <Radio className="h-3 w-3" />,
  triggered: <Volume2 className="h-3 w-3" />,
  spatial: <MapPin className="h-3 w-3" />,
};

const TYPE_COLORS: Record<AudioType, string> = {
  ambient: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
  triggered: 'text-yellow-400 border-yellow-500/30 bg-yellow-500/10',
  spatial: 'text-green-400 border-green-500/30 bg-green-500/10',
};

interface AudioTraitPanelProps {
  onClose: () => void;
}

export function AudioTraitPanel({ onClose }: AudioTraitPanelProps) {
  const [presets, setPresets] = useState<AudioPreset[]>([]);
  const [activeType, setActiveType] = useState<AudioType | ''>('');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const code = useSceneStore((s) => s.code) ?? '';
  const setCode = useSceneStore((s) => s.setCode);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (activeType) params.set('type', activeType);
    if (q) params.set('q', q);
    fetch(`/api/audio?${params}`)
      .then((r) => r.json())
      .then((d: { presets: AudioPreset[] }) => setPresets(d.presets))
      .catch((err) => logger.warn('Swallowed error caught:', err))
      .finally(() => setLoading(false));
  }, [activeType, q]);

  useEffect(() => {
    load();
  }, [load]);

  const copySnippet = (preset: AudioPreset) => {
    navigator.clipboard.writeText(preset.traitSnippet).catch((err) => logger.warn('Swallowed error caught:', err));
    setCopied(preset.id);
    setTimeout(() => setCopied(null), COPY_FEEDBACK_DURATION);
  };

  const insertIntoScene = (preset: AudioPreset) => {
    const snippet = `\nobject "${preset.name} Audio" {\n  ${preset.traitSnippet}\n  @transform(position: [0, 1, 0])\n}\n`;
    setCode(code + snippet);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Music className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Audio Traits</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="shrink-0 border-b border-studio-border p-2.5 space-y-2">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
            placeholder="Search audio…"
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
          />
        </div>
        <div className="flex gap-1">
          {(['', 'ambient', 'triggered', 'spatial'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t as AudioType | '')}
              className={`flex-1 rounded-full border py-0.5 text-[8px] font-medium transition ${
                activeType === t
                  ? 'border-studio-accent bg-studio-accent/20 text-studio-accent'
                  : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'
              }`}
            >
              {t || 'All'}
            </button>
          ))}
        </div>
      </div>

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5">
        {loading && (
          <p className="py-8 text-center text-[10px] text-studio-muted animate-pulse">
            Loading presets…
          </p>
        )}
        {!loading && presets.length === 0 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">No presets found.</p>
        )}

        {presets.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-studio-border bg-studio-surface p-2.5 space-y-1.5"
          >
            <div className="flex items-start gap-2">
              <div
                className={`mt-0.5 flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-medium ${TYPE_COLORS[p.type]}`}
              >
                {TYPE_ICONS[p.type]}
                {p.type}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-semibold text-studio-text">{p.name}</p>
                <p className="text-[9px] text-studio-muted line-clamp-2">{p.description}</p>
              </div>
            </div>

            {/* Metadata */}
            <div className="flex gap-3 text-[9px] text-studio-muted">
              <span>vol: {p.volume}</span>
              <span>{p.loop ? '🔁 loop' : '▶ one-shot'}</span>
              {p.spatialRadius && <span>radius: {p.spatialRadius}m</span>}
            </div>

            {/* Snippet preview */}
            <div className="rounded-lg bg-black/30 px-2 py-1.5 font-mono text-[8px] text-studio-muted">
              {p.traitSnippet}
            </div>

            {/* Actions */}
            <div className="flex gap-1.5">
              <button
                onClick={() => insertIntoScene(p)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-studio-accent py-1 text-[10px] font-semibold text-white hover:brightness-110"
              >
                + Insert
              </button>
              <button
                onClick={() => copySnippet(p)}
                className="flex items-center gap-1 rounded-lg border border-studio-border px-2.5 py-1 text-[9px] text-studio-muted hover:text-studio-text"
              >
                {copied === p.id ? (
                  <Check className="h-3 w-3 text-green-400" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
