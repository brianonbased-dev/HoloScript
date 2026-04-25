'use client';

/**
 * PhysicsPanel — physics body type preset picker with @physics trait insertion.
 * Wired to spatialEngineBridge for collision preview and terrain generation.
 */

import { useState, useEffect, useMemo } from 'react';
import { Atom, X, Search, Copy, Plus, Mountain, Crosshair } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import { useSpatialEngine } from '@/hooks/useSpatialEngine';
import { logger } from '@/lib/logger';
import { COPY_FEEDBACK_DURATION } from '@/lib/ui-timings';

interface PhysicsPreset {
  id: string;
  name: string;
  type: string;
  description: string;
  emoji: string;
  traitSnippet: string;
}

interface PhysicsPanelProps {
  onClose: () => void;
}

const TYPE_COLORS: Record<string, string> = {
  rigid: '#4488ff',
  static: '#888888',
  kinematic: '#ff8800',
  trigger: '#44cc88',
  soft: '#cc44ff',
  cloth: '#ffcc44',
  vehicle: '#ff4466',
  character: '#00ccff',
};

export function PhysicsPanel({ onClose }: PhysicsPanelProps) {
  const [presets, setPresets] = useState<PhysicsPreset[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PhysicsPreset | null>(null);
  const [copied, setCopied] = useState(false);
  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  // Spatial engine bridge for collision preview and terrain generation
  const { ready: engineReady, isWasm, generateTerrainSnippet } = useSpatialEngine();

  useEffect(() => {
    setLoading(true);
    fetch(`/api/physics?q=${encodeURIComponent(q)}`)
      .then((r) => r.json())
      .then((d: { presets: PhysicsPreset[] }) => setPresets(d.presets))
      .catch((err) => logger.warn('Swallowed error caught:', err))
      .finally(() => setLoading(false));
  }, [q]);

  const insert = (p: PhysicsPreset) => {
    setCode(code + `\nobject "Physics_${p.name.replace(/\s+/g, '_')}" {\n${p.traitSnippet}\n}\n`);
  };

  const copy = async (p: PhysicsPreset) => {
    await navigator.clipboard.writeText(p.traitSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), COPY_FEEDBACK_DURATION);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Atom className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Physics Traits</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="shrink-0 border-b border-studio-border p-2.5">
        <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 text-studio-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search physics types…"
            className="flex-1 bg-transparent text-[11px] outline-none placeholder-studio-muted/40"
          />
        </div>
      </div>

      {/* Preset cards */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {loading && (
          <p className="py-8 text-center text-[10px] text-studio-muted animate-pulse">Loading…</p>
        )}
        {presets.map((p) => (
          <div
            key={p.id}
            onClick={() => setSelected(selected?.id === p.id ? null : p)}
            className={`cursor-pointer overflow-hidden rounded-xl border transition ${selected?.id === p.id ? 'border-studio-accent bg-studio-accent/10' : 'border-studio-border bg-studio-surface hover:border-studio-accent/40'}`}
          >
            {/* Accent bar */}
            <div className="h-1" style={{ backgroundColor: TYPE_COLORS[p.type] ?? '#6666aa' }} />
            <div className="p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-xl">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] font-semibold">{p.name}</p>
                  <p className="text-[9px] text-studio-muted line-clamp-2">{p.description}</p>
                </div>
                <span
                  className="shrink-0 rounded-full border border-studio-border px-1.5 py-0.5 text-[7px] font-mono"
                  style={{ color: TYPE_COLORS[p.type] ?? '#888' }}
                >
                  {p.type}
                </span>
              </div>

              {/* Expanded snippet */}
              {selected?.id === p.id && (
                <div className="mt-2.5 space-y-2">
                  <pre className="rounded-lg bg-studio-panel p-2 text-[8px] text-studio-muted/80 overflow-x-auto leading-relaxed">
                    {p.traitSnippet.trim()}
                  </pre>
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        insert(p);
                      }}
                      className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-1.5 text-[10px] font-semibold text-white hover:brightness-110 transition"
                    >
                      <Plus className="h-3 w-3" /> Insert Object
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        copy(p);
                      }}
                      className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[9px] transition ${copied ? 'border-green-500/40 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
                    >
                      <Copy className="h-3 w-3" /> {copied ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Spatial Engine Quick Actions */}
      <div className="shrink-0 border-t border-studio-border p-2.5 space-y-1.5">
        <div className="flex items-center gap-1.5 text-[9px] text-studio-muted">
          <Crosshair className="h-3 w-3" />
          <span>
            Spatial Engine: {engineReady ? (isWasm ? 'WASM' : 'JS Fallback') : 'Loading...'}
          </span>
        </div>
        <button
          onClick={() => {
            const snippet = generateTerrainSnippet({ seed: Math.floor(Math.random() * 10000) });
            setCode(code + '\n' + snippet + '\n');
          }}
          disabled={!engineReady}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-studio-border bg-studio-surface py-1.5 text-[10px] text-studio-muted hover:text-studio-text hover:border-studio-accent/40 transition disabled:opacity-40"
        >
          <Mountain className="h-3 w-3" /> Generate Terrain Object
        </button>
      </div>
    </div>
  );
}
