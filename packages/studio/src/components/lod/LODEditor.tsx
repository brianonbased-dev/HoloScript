'use client';

/**
 * LODEditor — Level-of-Detail management with distance thresholds.
 */

import { useState, useCallback } from 'react';
import { Layers, Plus, Trash2, ArrowUpDown, Eye, Settings, BarChart3 } from 'lucide-react';

export interface LODLevel {
  id: number;
  label: string;
  distance: number;       // meters from camera
  polyCount: number;
  textureRes: number;     // px
  enabled: boolean;
}

export interface LODConfig {
  enabled: boolean;
  bias: number;           // quality bias (-1 to 1)
  fadeTransition: boolean;
  fadeDuration: number;   // seconds
  levels: LODLevel[];
}

const DEFAULT_CONFIG: LODConfig = {
  enabled: true, bias: 0, fadeTransition: true, fadeDuration: 0.3,
  levels: [
    { id: 0, label: 'LOD 0 (Full)', distance: 0, polyCount: 50000, textureRes: 2048, enabled: true },
    { id: 1, label: 'LOD 1 (Medium)', distance: 20, polyCount: 10000, textureRes: 1024, enabled: true },
    { id: 2, label: 'LOD 2 (Low)', distance: 50, polyCount: 2000, textureRes: 512, enabled: true },
    { id: 3, label: 'LOD 3 (Billboard)', distance: 100, polyCount: 4, textureRes: 256, enabled: true },
  ],
};

let nextLodId = 4;

function formatPoly(n: number): string { return n >= 1000 ? `${(n/1000).toFixed(1)}k` : String(n); }

export function LODEditor({ onChange }: { onChange?: (c: LODConfig) => void }) {
  const [config, setConfig] = useState<LODConfig>(DEFAULT_CONFIG);

  const update = useCallback((p: Partial<LODConfig>) => {
    setConfig(prev => { const n = {...prev,...p}; onChange?.(n); return n; });
  }, [onChange]);

  const updateLevel = useCallback((id: number, p: Partial<LODLevel>) => {
    update({ levels: config.levels.map(l => l.id === id ? {...l,...p} : l).sort((a,b) => a.distance - b.distance) });
  }, [config, update]);

  const addLevel = useCallback(() => {
    const maxDist = Math.max(...config.levels.map(l => l.distance), 0);
    const minPoly = Math.min(...config.levels.map(l => l.polyCount), 50000);
    update({ levels: [...config.levels, { id: nextLodId++, label: `LOD ${config.levels.length}`, distance: maxDist + 30, polyCount: Math.max(2, Math.floor(minPoly / 5)), textureRes: 256, enabled: true }].sort((a,b) => a.distance - b.distance) });
  }, [config, update]);

  const removeLevel = useCallback((id: number) => {
    if (config.levels.length <= 1) return;
    update({ levels: config.levels.filter(l => l.id !== id) });
  }, [config, update]);

  // Stats
  const totalSaved = config.levels.length > 0 ? ((1 - config.levels[config.levels.length-1].polyCount / config.levels[0].polyCount) * 100).toFixed(0) : '0';

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center justify-between border-b border-studio-border px-3 py-2">
        <div className="flex items-center gap-2"><Layers className="h-4 w-4 text-teal-400" /><span className="text-sm font-semibold text-studio-text">LOD Manager</span></div>
        <label className="flex items-center gap-1 text-[10px] text-studio-muted cursor-pointer">
          <input type="checkbox" checked={config.enabled} onChange={e=>update({enabled:e.target.checked})} className="rounded border-studio-border"/>Enable
        </label>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-3 border-b border-studio-border px-3 py-2 text-[10px] text-studio-muted">
        <span><BarChart3 className="inline h-3 w-3 mr-0.5"/>{config.levels.length} levels</span>
        <span>Max: {formatPoly(config.levels[0]?.polyCount || 0)} polys</span>
        <span className="text-teal-400">↓{totalSaved}% at far</span>
      </div>

      {/* LOD Levels */}
      {config.levels.map((level, i) => (
        <div key={level.id} className={`border-b border-studio-border px-3 py-2 ${!level.enabled ? 'opacity-40' : ''}`}>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-xs font-semibold text-studio-text">{level.label}</span>
            <div className="flex-1"/>
            <button onClick={()=>updateLevel(level.id,{enabled:!level.enabled})} className="text-studio-muted/40 hover:text-studio-text">{level.enabled?<Eye className="h-3 w-3"/>:<Eye className="h-3 w-3 opacity-30"/>}</button>
            {config.levels.length > 1 && <button onClick={()=>removeLevel(level.id)} className="text-studio-muted/30 hover:text-red-400"><Trash2 className="h-3 w-3"/></button>}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-0.5 text-[9px] text-studio-muted">
              Distance (m)
              <input type="number" value={level.distance} min={0} step={5} onChange={e=>updateLevel(level.id,{distance:parseFloat(e.target.value)||0})} className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-xs text-studio-text outline-none font-mono"/>
            </label>
            <label className="flex flex-col gap-0.5 text-[9px] text-studio-muted">
              Polygons
              <input type="number" value={level.polyCount} min={2} step={100} onChange={e=>updateLevel(level.id,{polyCount:parseInt(e.target.value)||2})} className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-xs text-studio-text outline-none font-mono"/>
            </label>
            <label className="flex flex-col gap-0.5 text-[9px] text-studio-muted">
              Texture (px)
              <select value={level.textureRes} onChange={e=>updateLevel(level.id,{textureRes:parseInt(e.target.value)})} className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-xs text-studio-text outline-none">
                {[64,128,256,512,1024,2048,4096].map(r=><option key={r} value={r}>{r}</option>)}
              </select>
            </label>
          </div>
          {/* Visual distance indicator */}
          <div className="mt-1.5 h-1 w-full rounded-full bg-studio-panel">
            <div className="h-1 rounded-full bg-teal-500 transition-all" style={{width:`${Math.min(100, (level.distance / (config.levels[config.levels.length-1]?.distance || 100)) * 100)}%`}}/>
          </div>
        </div>
      ))}

      {/* Add Level */}
      <button onClick={addLevel} className="flex items-center gap-1 px-3 py-2 text-[10px] text-studio-muted hover:text-studio-text border-b border-studio-border">
        <Plus className="h-3 w-3"/> Add LOD Level
      </button>

      {/* Settings */}
      <div className="flex flex-col gap-2 px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted">Settings</div>
        <div>
          <div className="flex justify-between text-[10px] text-studio-muted"><span>Quality Bias</span><span className="font-mono">{config.bias.toFixed(1)}</span></div>
          <input type="range" min={-1} max={1} step={0.1} value={config.bias} onChange={e=>update({bias:parseFloat(e.target.value)})} className="w-full accent-teal-500"/>
          <div className="flex justify-between text-[8px] text-studio-muted/40"><span>Performance</span><span>Quality</span></div>
        </div>
        <label className="flex items-center gap-2 text-[10px] text-studio-muted cursor-pointer">
          <input type="checkbox" checked={config.fadeTransition} onChange={e=>update({fadeTransition:e.target.checked})} className="rounded border-studio-border"/>Fade Transition
        </label>
        {config.fadeTransition && <div>
          <div className="flex justify-between text-[10px] text-studio-muted"><span>Fade Duration</span><span className="font-mono">{config.fadeDuration}s</span></div>
          <input type="range" min={0.05} max={1} step={0.05} value={config.fadeDuration} onChange={e=>update({fadeDuration:parseFloat(e.target.value)})} className="w-full accent-teal-500"/>
        </div>}
      </div>
    </div>
  );
}
