'use client';

/**
 * LodPanel — LOD/Camera Culling configuration panel.
 * Shows preset cards and lets user tweak distances then insert the @lod trait.
 */

import { useState, useEffect } from 'react';
import { Eye, X, Copy, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { useSceneStore } from '@/lib/stores';
import { logger } from '@/lib/logger';

interface LodLevel {
  distance: number;
  detail: string;
  label: string;
}
interface LodPreset {
  id: string;
  name: string;
  description: string;
  useCase: string;
  levels: LodLevel[];
  traitSnippet: string;
}

const DETAIL_COLOR: Record<string, string> = {
  high: 'text-green-400',
  medium: 'text-yellow-400',
  low: 'text-orange-400',
  culled: 'text-red-400',
};

interface LodPanelProps {
  onClose: () => void;
}

export function LodPanel({ onClose }: LodPanelProps) {
  const [presets, setPresets] = useState<LodPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const setCode = useSceneStore((s) => s.setCode);
  const code = useSceneStore((s) => s.code) ?? '';

  useEffect(() => {
    setLoading(true);
    fetch('/api/lod')
      .then((r) => r.json())
      .then((d: { presets: LodPreset[] }) => setPresets(d.presets))
      .catch((err) => logger.warn('Swallowed error caught:', err))
      .finally(() => setLoading(false));
  }, []);

  const insert = (preset: LodPreset) => {
    // Append as an object block; user can move the trait to their own object
    const snippet = `\nobject "LOD_Object" {\n${preset.traitSnippet}\n}\n`;
    setCode(code + snippet);
  };

  const copy = async (preset: LodPreset) => {
    await navigator.clipboard.writeText(preset.traitSnippet);
    setCopied(preset.id);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Eye className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">LOD / Camera Culling</span>
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Info strip */}
      <div className="shrink-0 border-b border-studio-border bg-studio-surface/30 px-3 py-2">
        <p className="text-[9px] text-studio-muted">
          Add <code className="rounded bg-studio-border/60 px-1 text-studio-accent">@lod</code> to
          any object to enable distance-based detail reduction and frustum culling.
        </p>
      </div>

      {/* Preset list */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
        {loading && (
          <p className="py-8 text-center text-[10px] text-studio-muted animate-pulse">Loading…</p>
        )}
        {presets.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border border-studio-border bg-studio-surface transition hover:border-studio-accent/30"
          >
            <button
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
              onClick={() => setExpanded(expanded === p.id ? null : p.id)}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-studio-text">{p.name}</p>
                <p className="text-[9px] text-studio-muted">{p.useCase}</p>
              </div>
              {expanded === p.id ? (
                <ChevronUp className="h-3 w-3 text-studio-muted" />
              ) : (
                <ChevronDown className="h-3 w-3 text-studio-muted" />
              )}
            </button>

            {expanded === p.id && (
              <div className="border-t border-studio-border/50 px-3 pb-3 pt-2 space-y-2">
                <p className="text-[9px] text-studio-muted">{p.description}</p>

                {/* Distance table */}
                <div className="rounded-lg overflow-hidden border border-studio-border/40">
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr className="bg-studio-border/20">
                        <th className="px-2 py-1 text-left text-studio-muted font-medium">
                          Distance
                        </th>
                        <th className="px-2 py-1 text-left text-studio-muted font-medium">
                          Detail
                        </th>
                        <th className="px-2 py-1 text-left text-studio-muted font-medium">
                          Description
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {p.levels.map((l) => (
                        <tr key={l.detail} className="border-t border-studio-border/30">
                          <td className="px-2 py-1 font-mono text-studio-text">{l.distance}m</td>
                          <td
                            className={`px-2 py-1 font-semibold ${DETAIL_COLOR[l.detail] ?? 'text-studio-muted'}`}
                          >
                            {l.detail}
                          </td>
                          <td className="px-2 py-1 text-studio-muted">{l.label}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Snippet preview */}
                <pre className="rounded-lg bg-studio-panel p-2 text-[8px] text-studio-muted/80 overflow-x-auto">
                  {p.traitSnippet.trim()}
                </pre>

                <div className="flex gap-1.5">
                  <button
                    onClick={() => insert(p)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-xl bg-studio-accent py-1.5 text-[10px] font-semibold text-white hover:brightness-110 transition"
                  >
                    <Plus className="h-3 w-3" /> Insert
                  </button>
                  <button
                    onClick={() => copy(p)}
                    className={`flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-[9px] transition ${copied === p.id ? 'border-green-500/40 text-green-400' : 'border-studio-border text-studio-muted hover:text-studio-text'}`}
                  >
                    <Copy className="h-3 w-3" /> {copied === p.id ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
