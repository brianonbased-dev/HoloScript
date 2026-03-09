'use client';

/**
 * ForensicScenePanel — Crime scene investigation with evidence markers and chain of custody.
 */

import { useState } from 'react';
import { Search, MapPin, Camera, FileText, AlertTriangle, CheckCircle, Shield } from 'lucide-react';

export type MarkerType =
  | 'blood'
  | 'fiber'
  | 'fingerprint'
  | 'weapon'
  | 'footprint'
  | 'dna'
  | 'other';
export type ChainStatus = 'collected' | 'in-transit' | 'lab' | 'analyzed' | 'court';

export interface EvidenceMarker {
  id: string;
  number: number;
  type: MarkerType;
  description: string;
  position: { x: number; y: number };
  chainStatus: ChainStatus;
  collectedBy: string;
  collectedAt: number;
  notes: string;
}

const MARKER_COLORS: Record<MarkerType, string> = {
  blood: '#dc2626',
  fiber: '#8b5cf6',
  fingerprint: '#3b82f6',
  weapon: '#ef4444',
  footprint: '#f59e0b',
  dna: '#10b981',
  other: '#6b7280',
};
const CHAIN_STEPS: ChainStatus[] = ['collected', 'in-transit', 'lab', 'analyzed', 'court'];

const DEMO_MARKERS: EvidenceMarker[] = [
  {
    id: '1',
    number: 1,
    type: 'blood',
    description: 'Blood spatter pattern on wall',
    position: { x: 30, y: 45 },
    chainStatus: 'analyzed',
    collectedBy: 'Det. Smith',
    collectedAt: Date.now() - 86400000,
    notes: 'Type O+, matches victim',
  },
  {
    id: '2',
    number: 2,
    type: 'fingerprint',
    description: 'Latent print on door handle',
    position: { x: 70, y: 60 },
    chainStatus: 'lab',
    collectedBy: 'CSI Johnson',
    collectedAt: Date.now() - 82800000,
    notes: 'Partial, 7-point match pending',
  },
  {
    id: '3',
    number: 3,
    type: 'weapon',
    description: 'Kitchen knife under sofa',
    position: { x: 55, y: 80 },
    chainStatus: 'analyzed',
    collectedBy: 'CSI Johnson',
    collectedAt: Date.now() - 79200000,
    notes: 'Serrated edge, blood traces present',
  },
  {
    id: '4',
    number: 4,
    type: 'fiber',
    description: 'Blue cotton thread on window frame',
    position: { x: 85, y: 25 },
    chainStatus: 'in-transit',
    collectedBy: 'Det. Smith',
    collectedAt: Date.now() - 75600000,
    notes: 'Possible entry point fabric transfer',
  },
  {
    id: '5',
    number: 5,
    type: 'footprint',
    description: 'Shoe impression in garden soil',
    position: { x: 90, y: 90 },
    chainStatus: 'collected',
    collectedBy: 'CSI Park',
    collectedAt: Date.now() - 72000000,
    notes: 'Size 11, athletic shoe tread pattern',
  },
];

export function ForensicScenePanel() {
  const [markers] = useState<EvidenceMarker[]>(DEMO_MARKERS);
  const [selected, setSelected] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<MarkerType | 'all'>('all');

  const filtered = markers.filter((m) => filterType === 'all' || m.type === filterType);
  const sel = markers.find((m) => m.id === selected);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Shield className="h-4 w-4 text-red-400" />
        <span className="text-sm font-semibold text-studio-text">Forensic Scene</span>
        <span className="text-[10px] text-studio-muted">{markers.length} markers</span>
      </div>

      {/* Scene Map */}
      <div className="relative mx-3 mt-2 h-32 rounded-lg border border-studio-border bg-studio-panel/30">
        {markers.map((m) => (
          <button
            key={m.id}
            onClick={() => setSelected(m.id)}
            className={`absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[8px] font-bold text-white shadow ${selected === m.id ? 'ring-2 ring-white scale-125' : ''}`}
            style={{
              left: `${m.position.x}%`,
              top: `${m.position.y}%`,
              background: MARKER_COLORS[m.type],
            }}
          >
            {m.number}
          </button>
        ))}
      </div>

      {/* Type Filter */}
      <div className="flex flex-wrap gap-1 border-b border-studio-border px-2 py-1.5">
        <button
          onClick={() => setFilterType('all')}
          className={`rounded px-1.5 py-0.5 text-[9px] ${filterType === 'all' ? 'bg-studio-accent/20 text-studio-accent' : 'text-studio-muted'}`}
        >
          All
        </button>
        {(Object.keys(MARKER_COLORS) as MarkerType[]).map((t) => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] ${filterType === t ? 'text-studio-text' : 'text-studio-muted/50'}`}
          >
            <span className="h-2 w-2 rounded-full" style={{ background: MARKER_COLORS[t] }} />
            {t}
          </button>
        ))}
      </div>

      {/* Evidence List */}
      {filtered.map((m) => (
        <div
          key={m.id}
          onClick={() => setSelected(m.id)}
          className={`flex items-start gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === m.id ? 'bg-red-500/10' : 'hover:bg-studio-panel/50'}`}
        >
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: MARKER_COLORS[m.type] }}
          >
            {m.number}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-studio-text">{m.description}</div>
            <div className="text-[10px] text-studio-muted">
              {m.collectedBy} · {m.type}
            </div>
          </div>
        </div>
      ))}

      {/* Chain of Custody */}
      {sel && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
            Chain of Custody — #{sel.number}
          </div>
          <div className="flex gap-1 mb-2">
            {CHAIN_STEPS.map((step, i) => {
              const active = CHAIN_STEPS.indexOf(sel.chainStatus) >= i;
              return (
                <div
                  key={step}
                  className={`flex-1 rounded py-0.5 text-center text-[8px] ${active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-studio-panel text-studio-muted/30'}`}
                >
                  {step}
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-studio-muted">{sel.notes}</div>
        </div>
      )}
    </div>
  );
}
