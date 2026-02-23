'use client';

/**
 * ExportPipelinePanel — v2 export panel with OBJ/FBX/glTF/USD/JSON format grid.
 */

import { useState } from 'react';
import { Package, X, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useSceneStore } from '@/lib/store';

type V2Format = 'obj' | 'fbx' | 'gltf' | 'usd' | 'json';
type ExportStatus = 'idle' | 'exporting' | 'done' | 'error';

const FORMATS: { id: V2Format; label: string; ext: string; desc: string; badge?: string }[] = [
  { id: 'obj', label: 'OBJ + MTL', ext: '.obj', desc: 'Wavefront OBJ with material library. Compatible with Blender, Cinema 4D, Maya.', badge: 'NEW' },
  { id: 'fbx', label: 'FBX ASCII', ext: '.fbx', desc: 'ASCII FBX 7.4 scaffold with full transform data. Import into Maya or Blender.', badge: 'NEW' },
  { id: 'gltf', label: 'glTF JSON', ext: '.gltf', desc: 'Node-based glTF 2.0 scene graph. Ready for Three.js, Babylon.js, model viewers.' },
  { id: 'usd', label: 'USD/USDA', ext: '.usda', desc: 'Universal Scene Description. Compatible with Apple Reality Composer, Omniverse.' },
  { id: 'json', label: 'HoloScript JSON', ext: '.json', desc: 'Structured JSON of the parsed scene graph + original source. For tooling.' },
];

interface ExportPipelinePanelProps { onClose: () => void; }

export function ExportPipelinePanel({ onClose }: ExportPipelinePanelProps) {
  const code = useSceneStore((s) => s.code) ?? '';
  const [format, setFormat] = useState<V2Format>('obj');
  const [sceneName, setSceneName] = useState('');
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  const selected = FORMATS.find((f) => f.id === format)!;

  // Line and object count for summary
  const lines = code.split('\n').filter((l) => l.trim()).length;
  const objects = (code.match(/^object\s+"/gm) ?? []).length;

  const handleExport = async () => {
    setStatus('exporting');
    setError(null);
    try {
      const res = await fetch('/api/export/v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, format, sceneName: sceneName || undefined }),
      });
      if (!res.ok) { const d = await res.json() as { error: string }; throw new Error(d.error); }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (res.headers.get('content-disposition')?.match(/filename="([^"]+)"/) ?? [])[1] ?? `scene_${format}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setStatus('done');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Package className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Export Pipeline v2</span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Scene summary */}
        <div className="grid grid-cols-3 gap-2 rounded-xl border border-studio-border bg-studio-surface p-2.5 text-center">
          {[['Lines', lines], ['Objects', objects], ['KB', (new Blob([code]).size / 1024).toFixed(1)]].map(([l, v]) => (
            <div key={String(l)}>
              <p className="text-[14px] font-bold text-studio-accent">{v}</p>
              <p className="text-[9px] text-studio-muted">{l}</p>
            </div>
          ))}
        </div>

        {/* Scene name override */}
        <div>
          <label className="mb-1 block text-[10px] text-studio-muted">Scene name override</label>
          <input value={sceneName} onChange={(e) => setSceneName(e.target.value)}
            placeholder="Leave blank to use scene declaration"
            className="w-full rounded-lg border border-studio-border bg-studio-surface px-2.5 py-1.5 text-[11px] outline-none focus:border-studio-accent placeholder-studio-muted/40" />
        </div>

        {/* Format grid */}
        <div>
          <p className="mb-1.5 text-[10px] text-studio-muted">Output format</p>
          <div className="space-y-1">
            {FORMATS.map((f) => (
              <button key={f.id} onClick={() => setFormat(f.id)}
                className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                  format === f.id
                    ? 'border-studio-accent bg-studio-accent/10'
                    : 'border-studio-border bg-studio-surface hover:border-studio-accent/40'
                }`}>
                <div className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 transition" style={{ borderColor: format === f.id ? 'var(--studio-accent)' : '#555', backgroundColor: format === f.id ? 'var(--studio-accent)' : 'transparent' }} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-studio-text">{f.label}</span>
                    <span className="font-mono text-[9px] text-studio-muted">{f.ext}</span>
                    {f.badge && <span className="rounded bg-studio-accent/20 px-1 py-0.5 text-[7px] font-bold text-studio-accent">{f.badge}</span>}
                  </div>
                  <p className="mt-0.5 text-[9px] text-studio-muted">{f.desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {status === 'error' && error && (
          <div className="flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-2.5 text-[10px] text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
          </div>
        )}
      </div>

      {/* Export button */}
      <div className="shrink-0 border-t border-studio-border p-3">
        <button
          onClick={handleExport}
          disabled={status === 'exporting' || !code.trim()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
          {status === 'exporting' ? (
            <><Loader2 className="h-4 w-4 animate-spin" />Exporting…</>
          ) : status === 'done' ? (
            <><CheckCircle className="h-4 w-4" />Downloaded!</>
          ) : (
            <><Download className="h-4 w-4" />Export {selected.label}</>
          )}
        </button>
        <p className="mt-1.5 text-center text-[9px] text-studio-muted">
          Downloads as a .zip including source + {selected.ext}
        </p>
      </div>
    </div>
  );
}
