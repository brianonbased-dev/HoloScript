'use client';

/**
 * ParticlePanel — right-rail preset picker for @particles trait.
 */

import { useState, useEffect } from 'react';
import { Sparkles, X, Search, Copy, Plus } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import { logger } from '@/lib/logger';

interface ParticlePreset {
  id: string;
  name: string;
  type: string;
  description: string;
  emoji: string;
  color: string;
  traitSnippet: string;
}

const TYPE_LABEL: Record<string, string> = {
  fire: 'fire',
  snow: 'snow',
  sparks: 'sparks',
  rain: 'rain',
  smoke: 'smoke',
  magic: 'magic',
  bubbles: 'bubbles',
  leaves: 'leaves',
};

interface ParticlePanelProps {
  onClose: () => void;
}

export function ParticlePanel({ onClose }: ParticlePanelProps) {
  const [presets, setPresets] = useState<ParticlePreset[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [activeType, setActiveType] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  useEffect(() => {
    setLoading(true);
    fetch(`/api/particles?type=${encodeURIComponent(activeType)}&q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d: { presets: ParticlePreset[]; types: string[] }) => {
        setPresets(d.presets);
        if (d.types?.length) setTypes(d.types);
      })
      .catch((err) => logger.warn('Swallowed error caught:', err))
      .finally(() => setLoading(false));
  }, [activeType, q]);

  const insert = (preset: ParticlePreset) => {
    // Append an object block with the particle trait at end of scene code
    const snippet = `\nobject "Particles_${preset.name}" {\n${preset.traitSnippet}\n}\n`;
    setCode(code + snippet);
  };

  const copy = async (preset: ParticlePreset) => {
    await navigator.clipboard.writeText(preset.traitSnippet);
    setCopied(preset.id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Sparkles className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Particle Traits</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search + type filter */}
      <div className="shrink-0 space-y-2 border-b border-studio-border p-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search presets…"
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setActiveType('')}
            className={`rounded-full border px-2 py-0.5 text-[9px] transition ${activeType === '' ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'}`}
          >
            All
          </button>
          {types.map((t) => (
            <button
              key={t}
              onClick={() => setActiveType(t === activeType ? '' : t)}
              className={`rounded-full border px-2 py-0.5 text-[9px] transition ${activeType === t ? 'border-studio-accent bg-studio-accent/20 text-studio-accent' : 'border-studio-border bg-studio-surface text-studio-muted hover:text-studio-text'}`}
            >
              {TYPE_LABEL[t] ?? t}
            </button>
          ))}
        </div>
      </div>

      {/* Preset list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {loading && (
          <p className="py-8 text-center text-[10px] text-studio-muted animate-pulse">Loading…</p>
        )}
        {!loading && presets.length === 0 && (
          <p className="py-8 text-center text-[10px] text-studio-muted">No presets found.</p>
        )}
        {presets.map((p) => (
          <div
            key={p.id}
            className="overflow-hidden rounded-xl border border-studio-border bg-studio-surface transition hover:border-studio-accent/40"
          >
            {/* Color bar */}
            <div className="h-1 w-full" style={{ backgroundColor: p.color }} />
            <div className="p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold text-studio-text">{p.name}</p>
                  <p className="text-[9px] text-studio-muted line-clamp-2">{p.description}</p>
                </div>
                <span className="shrink-0 rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] text-studio-muted">
                  {p.type}
                </span>
              </div>
              {/* Snippet preview */}
              <pre className="mt-2 overflow-x-auto rounded-lg bg-studio-panel p-2 text-[8px] text-studio-muted/80 leading-relaxed line-clamp-3">
                {p.traitSnippet.trim()}
              </pre>
              <div className="mt-2 flex gap-1.5">
                <button
                  onClick={() => insert(p)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-1.5 text-[10px] font-semibold text-white hover:brightness-110 transition"
                >
                  <Plus className="h-3 w-3" /> Insert Object
                </button>
                <button
                  onClick={() => copy(p)}
                  className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[9px] transition ${copied === p.id ? 'border-green-500/40 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
                >
                  <Copy className="h-3 w-3" /> {copied === p.id ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
