'use client';

/**
 * ExportPanel — right-rail panel for exporting the current scene.
 * Format options: glTF 2.0, USDA, JSON. Downloads a ZIP archive.
 */

import { useState } from 'react';
import { Download, X, FileCode, Package, Loader2, CheckCircle, AlertCircle, ChevronDown } from 'lucide-react';
import { useSceneExport, type ExportFormat } from '@/hooks/useSceneExport';
import { useSceneStore } from '@/lib/store';

const FORMATS: { id: ExportFormat; label: string; ext: string; desc: string }[] = [
  { id: 'gltf', label: 'glTF 2.0', ext: '.gltf + assets', desc: 'Industry standard 3D format. Compatible with Blender, Unity, Unreal, and threejs.' },
  { id: 'usd',  label: 'USD / USDA', ext: '.usda', desc: 'Universal Scene Description. Native format for Apple RealityKit and Pixar pipelines.' },
  { id: 'usdz', label: 'USDZ', ext: '.usda (zipped)', desc: 'Compressed USD for iOS AR Quick Look and visionOS apps.' },
  { id: 'json', label: 'Scene JSON', ext: '.json', desc: 'HoloScript scene graph as structured JSON. Useful for custom pipelines.' },
];

interface ExportPanelProps {
  onClose: () => void;
}

export function ExportPanel({ onClose }: ExportPanelProps) {
  const code = useSceneStore((s) => s.code) ?? '';
  const [format, setFormat] = useState<ExportFormat>('gltf');
  const [sceneName, setSceneName] = useState('');
  const { status, error, exportScene } = useSceneExport();

  const selected = FORMATS.find((f) => f.id === format)!;
  const lineCount = code.split('\n').length;
  const objCount = (code.match(/^\s*object\s+"/gm) ?? []).length;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Download className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Export Scene</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Scene summary */}
        <div className="rounded-xl border border-studio-border bg-studio-surface p-3 space-y-1 text-[11px]">
          <p className="font-semibold text-studio-text">Current Scene</p>
          <div className="flex gap-3 text-studio-muted">
            <span>{lineCount} lines</span>
            <span>{objCount} objects</span>
            <span>{(new TextEncoder().encode(code).length / 1024).toFixed(1)}KB source</span>
          </div>
        </div>

        {/* Scene name override */}
        <div>
          <label className="mb-1 block text-[10px] text-studio-muted">Scene name (optional)</label>
          <input
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            placeholder="Leave blank to auto-detect"
            className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] text-studio-text outline-none placeholder-studio-muted/40 focus:border-studio-accent"
          />
        </div>

        {/* Format picker */}
        <div>
          <label className="mb-1 block text-[10px] text-studio-muted">Export format</label>
          <div className="space-y-1.5">
            {FORMATS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFormat(f.id)}
                className={`w-full rounded-xl border px-3 py-2 text-left transition ${
                  format === f.id
                    ? 'border-studio-accent bg-studio-accent/10'
                    : 'border-studio-border bg-studio-surface hover:border-studio-border/80'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-studio-text">{f.label}</span>
                  <span className="text-[9px] font-mono text-studio-muted">{f.ext}</span>
                </div>
                <p className="mt-0.5 text-[10px] text-studio-muted">{f.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* What's included */}
        <div className="rounded-xl border border-studio-border bg-studio-surface p-3 text-[11px] text-studio-muted space-y-1">
          <p className="font-semibold text-studio-text">ZIP contents</p>
          <p>• <span className="font-mono">{selected.ext}</span> — scene geometry &amp; materials</p>
          <p>• <span className="font-mono">source.holoscript</span> — original source</p>
          <p>• <span className="font-mono">README.txt</span> — usage instructions</p>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-[11px] text-red-400">
            <AlertCircle className="h-4 w-4 shrink-0" />{error}
          </div>
        )}
      </div>

      {/* Action */}
      <div className="shrink-0 border-t border-studio-border p-3">
        <button
          onClick={() => exportScene(format, sceneName || undefined)}
          disabled={status === 'exporting' || !code.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-50"
        >
          {status === 'exporting' && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === 'done' && <CheckCircle className="h-4 w-4" />}
          {status === 'idle' || status === 'error' ? <Download className="h-4 w-4" /> : null}
          {status === 'exporting' ? 'Exporting…' : status === 'done' ? 'Downloaded!' : `Export as ${selected.label}`}
        </button>
      </div>
    </div>
  );
}
