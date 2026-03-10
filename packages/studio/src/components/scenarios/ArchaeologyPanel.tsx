'use client';

/**
 * ArchaeologyPanel — Excavation grid, artifact catalog, stratigraphy layers.
 */

import { useState, useCallback } from 'react';
import { Compass, Layers, MapPin, Camera, Filter, Plus, Eye } from 'lucide-react';

export type ArtifactCondition = 'intact' | 'fragmented' | 'damaged' | 'trace';
export type StratLayer = { id: number; name: string; depth: number; color: string; period: string };

export interface Artifact {
  id: string;
  name: string;
  type: string;
  condition: ArtifactCondition;
  gridX: number;
  gridY: number;
  depth: number;
  layer: string;
  description: string;
  dateEstimate: string;
  photo: boolean;
}

const LAYERS: StratLayer[] = [
  { id: 0, name: 'Topsoil', depth: 0, color: '#8B6914', period: 'Modern' },
  { id: 1, name: 'Alluvium', depth: 0.3, color: '#A0522D', period: '1800s' },
  { id: 2, name: 'Cultural Layer A', depth: 0.8, color: '#6B4226', period: 'Medieval' },
  { id: 3, name: 'Cultural Layer B', depth: 1.5, color: '#5C3317', period: 'Roman' },
  { id: 4, name: 'Bedrock', depth: 2.5, color: '#808080', period: 'Geological' },
];

const DEMO_ARTIFACTS: Artifact[] = [
  {
    id: '1',
    name: 'Pottery Shard',
    type: 'ceramic',
    condition: 'fragmented',
    gridX: 3,
    gridY: 7,
    depth: 0.9,
    layer: 'Cultural Layer A',
    description: 'Decorated rim fragment',
    dateEstimate: '~1200 CE',
    photo: true,
  },
  {
    id: '2',
    name: 'Iron Nail',
    type: 'metal',
    condition: 'damaged',
    gridX: 5,
    gridY: 2,
    depth: 1.6,
    layer: 'Cultural Layer B',
    description: 'Hand-forged square nail',
    dateEstimate: '~200 CE',
    photo: true,
  },
  {
    id: '3',
    name: 'Coin (Denarius)',
    type: 'metal',
    condition: 'intact',
    gridX: 4,
    gridY: 5,
    depth: 1.7,
    layer: 'Cultural Layer B',
    description: 'Silver denarius, emperor profile visible',
    dateEstimate: '~150 CE',
    photo: false,
  },
  {
    id: '4',
    name: 'Bone Fragment',
    type: 'organic',
    condition: 'fragmented',
    gridX: 6,
    gridY: 8,
    depth: 1.2,
    layer: 'Cultural Layer A',
    description: 'Animal bone, possibly cattle',
    dateEstimate: '~1100 CE',
    photo: false,
  },
  {
    id: '5',
    name: 'Charcoal Deposit',
    type: 'organic',
    condition: 'trace',
    gridX: 3,
    gridY: 3,
    depth: 1.8,
    layer: 'Cultural Layer B',
    description: 'Hearth remnant, suitable for C14',
    dateEstimate: '~100 CE',
    photo: true,
  },
];

const CONDITION_COLORS: Record<ArtifactCondition, string> = {
  intact: 'text-emerald-400',
  fragmented: 'text-amber-400',
  damaged: 'text-red-400',
  trace: 'text-purple-400',
};

export function ArchaeologyPanel() {
  const [artifacts, setArtifacts] = useState<Artifact[]>(DEMO_ARTIFACTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'catalog' | 'strat' | 'grid'>('catalog');
  const [layerFilter, setLayerFilter] = useState<string>('all');

  const filtered = artifacts.filter((a) => layerFilter === 'all' || a.layer === layerFilter);
  const sel = artifacts.find((a) => a.id === selected);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Compass className="h-4 w-4 text-amber-600" />
        <span className="text-sm font-semibold text-studio-text">Excavation</span>
        <span className="text-[10px] text-studio-muted">{artifacts.length} finds</span>
      </div>

      <div className="flex gap-1 border-b border-studio-border p-1">
        {(['catalog', 'strat', 'grid'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded px-2 py-1 text-[10px] ${view === v ? 'bg-amber-500/20 text-amber-400' : 'text-studio-muted'}`}
          >
            {v === 'strat' ? 'Layers' : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {view === 'catalog' && (
        <>
          <div className="flex gap-1 border-b border-studio-border px-2 py-1">
            <button
              onClick={() => setLayerFilter('all')}
              className={`rounded px-1.5 py-0.5 text-[9px] ${layerFilter === 'all' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
            >
              All
            </button>
            {LAYERS.filter((l) => l.period !== 'Geological').map((l) => (
              <button
                key={l.id}
                onClick={() => setLayerFilter(l.name)}
                className={`rounded px-1.5 py-0.5 text-[9px] ${layerFilter === l.name ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
              >
                {l.period}
              </button>
            ))}
          </div>
          {filtered.map((a) => (
            <div
              key={a.id}
              onClick={() => setSelected(a.id)}
              className={`flex items-start gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === a.id ? 'bg-amber-500/10' : 'hover:bg-studio-panel/50'}`}
            >
              <MapPin className="h-3 w-3 mt-0.5 text-studio-muted/40" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-studio-text">{a.name}</div>
                <div className="text-[10px] text-studio-muted">{a.description}</div>
                <div className="flex gap-2 mt-0.5 text-[9px]">
                  <span className={CONDITION_COLORS[a.condition]}>{a.condition}</span>
                  <span className="text-studio-muted/50">{a.dateEstimate}</span>
                  <span className="text-studio-muted/50">
                    ({a.gridX},{a.gridY}) d={a.depth}m
                  </span>
                </div>
              </div>
              {a.photo && <Camera className="h-3 w-3 text-studio-muted/30" />}
            </div>
          ))}
        </>
      )}

      {view === 'strat' && (
        <div className="flex flex-col gap-0 px-3 py-2">
          {LAYERS.map((layer) => (
            <div
              key={layer.id}
              className="flex items-center gap-2 border-l-4 px-2 py-2"
              style={{ borderColor: layer.color }}
            >
              <div className="h-6 w-6 rounded" style={{ background: layer.color }} />
              <div className="flex-1">
                <div className="text-xs font-semibold text-studio-text">{layer.name}</div>
                <div className="text-[10px] text-studio-muted">
                  {layer.period} · {layer.depth}m depth
                </div>
              </div>
              <span className="text-[10px] text-studio-muted">
                {artifacts.filter((a) => a.layer === layer.name).length} finds
              </span>
            </div>
          ))}
        </div>
      )}

      {view === 'grid' && (
        <div className="p-3">
          <div className="grid grid-cols-10 gap-px bg-studio-border rounded overflow-hidden">
            {Array.from({ length: 100 }, (_, i) => {
              const x = i % 10;
              const y = Math.floor(i / 10);
              const here = artifacts.filter((a) => a.gridX === x && a.gridY === y);
              return (
                <div
                  key={i}
                  className={`h-6 flex items-center justify-center text-[8px] ${here.length ? 'bg-amber-500/20 text-amber-400 font-bold' : 'bg-studio-panel/30 text-studio-muted/20'}`}
                >
                  {here.length || '·'}
                </div>
              );
            })}
          </div>
          <div className="mt-1 text-[9px] text-studio-muted text-center">
            10×10 excavation grid — numbers = artifact count
          </div>
        </div>
      )}
    </div>
  );
}
