'use client';

/**
 * EpidemicPanel — Epidemic heatmap with SIR model parameters and outbreak tracking.
 */

import { useState, useCallback, useMemo } from 'react';
import { Activity, MapPin, TrendingUp, Users, AlertTriangle, BarChart3 } from 'lucide-react';

export interface OutbreakZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  infected: number;
  recovered: number;
  deaths: number;
  population: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}
export interface SIRParams {
  beta: number;
  gamma: number;
  r0: number;
  incubation: number;
}

const RISK_COLORS: Record<string, string> = {
  low: '#22c55e',
  medium: '#eab308',
  high: '#f97316',
  critical: '#ef4444',
};

const DEMO_ZONES: OutbreakZone[] = [
  {
    id: '1',
    name: 'Metro District A',
    lat: 40.7,
    lng: -74.0,
    infected: 1250,
    recovered: 890,
    deaths: 23,
    population: 500000,
    riskLevel: 'high',
  },
  {
    id: '2',
    name: 'Suburban Zone B',
    lat: 40.8,
    lng: -73.9,
    infected: 320,
    recovered: 210,
    deaths: 5,
    population: 200000,
    riskLevel: 'medium',
  },
  {
    id: '3',
    name: 'Rural Area C',
    lat: 41.0,
    lng: -74.2,
    infected: 45,
    recovered: 30,
    deaths: 1,
    population: 50000,
    riskLevel: 'low',
  },
  {
    id: '4',
    name: 'Harbor District D',
    lat: 40.6,
    lng: -74.1,
    infected: 2100,
    recovered: 800,
    deaths: 67,
    population: 350000,
    riskLevel: 'critical',
  },
  {
    id: '5',
    name: 'University Zone E',
    lat: 40.9,
    lng: -73.8,
    infected: 580,
    recovered: 400,
    deaths: 3,
    population: 120000,
    riskLevel: 'medium',
  },
];

export function EpidemicPanel() {
  const [zones] = useState<OutbreakZone[]>(DEMO_ZONES);
  const [params, setParams] = useState<SIRParams>({
    beta: 0.3,
    gamma: 0.1,
    r0: 3.0,
    incubation: 5,
  });
  const [selected, setSelected] = useState<string | null>(null);

  const totals = useMemo(
    () => ({
      infected: zones.reduce((s, z) => s + z.infected, 0),
      recovered: zones.reduce((s, z) => s + z.recovered, 0),
      deaths: zones.reduce((s, z) => s + z.deaths, 0),
      population: zones.reduce((s, z) => s + z.population, 0),
    }),
    [zones]
  );

  const sel = zones.find((z) => z.id === selected);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Activity className="h-4 w-4 text-red-400" />
        <span className="text-sm font-semibold text-studio-text">Epidemic Tracker</span>
      </div>

      {/* Dashboard */}
      <div className="grid grid-cols-4 gap-1 border-b border-studio-border p-2 text-center">
        <div className="rounded bg-red-500/10 p-1.5">
          <div className="text-[9px] text-red-400">Infected</div>
          <div className="font-mono text-sm font-bold text-red-400">
            {totals.infected.toLocaleString()}
          </div>
        </div>
        <div className="rounded bg-emerald-500/10 p-1.5">
          <div className="text-[9px] text-emerald-400">Recovered</div>
          <div className="font-mono text-sm font-bold text-emerald-400">
            {totals.recovered.toLocaleString()}
          </div>
        </div>
        <div className="rounded bg-studio-panel p-1.5">
          <div className="text-[9px] text-studio-muted">Deaths</div>
          <div className="font-mono text-sm font-bold text-studio-muted">
            {totals.deaths.toLocaleString()}
          </div>
        </div>
        <div className="rounded bg-blue-500/10 p-1.5">
          <div className="text-[9px] text-blue-400">CFR</div>
          <div className="font-mono text-sm font-bold text-blue-400">
            {((totals.deaths / totals.infected) * 100).toFixed(1)}%
          </div>
        </div>
      </div>

      {/* SIR Parameters */}
      <div className="border-b border-studio-border px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
          SIR Model
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'β (trans)', key: 'beta' as const, min: 0, max: 1, step: 0.01 },
            { label: 'γ (recov)', key: 'gamma' as const, min: 0, max: 1, step: 0.01 },
            { label: 'R₀', key: 'r0' as const, min: 0, max: 10, step: 0.1 },
            { label: 'Incub (d)', key: 'incubation' as const, min: 1, max: 21, step: 1 },
          ].map(({ label, key, min, max, step }) => (
            <label key={key} className="flex flex-col gap-0.5 text-[9px] text-studio-muted">
              {label}
              <input
                type="number"
                value={params[key]}
                min={min}
                max={max}
                step={step}
                onChange={(e) => setParams((p) => ({ ...p, [key]: parseFloat(e.target.value) }))}
                className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-[10px] text-studio-text outline-none font-mono"
              />
            </label>
          ))}
        </div>
      </div>

      {/* Zone List */}
      {zones.map((z) => (
        <div
          key={z.id}
          onClick={() => setSelected(z.id)}
          className={`flex items-center gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === z.id ? 'bg-red-500/10' : 'hover:bg-studio-panel/50'}`}
        >
          <div className="h-3 w-3 rounded-full" style={{ background: RISK_COLORS[z.riskLevel] }} />
          <div className="flex-1">
            <div className="text-xs text-studio-text">{z.name}</div>
          </div>
          <span className="font-mono text-[10px] text-red-400">{z.infected.toLocaleString()}</span>
          <span
            className={`rounded px-1 text-[8px] font-bold ${z.riskLevel === 'critical' ? 'bg-red-500/20 text-red-400' : z.riskLevel === 'high' ? 'bg-orange-500/20 text-orange-400' : z.riskLevel === 'medium' ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'}`}
          >
            {z.riskLevel}
          </span>
        </div>
      ))}

      {/* Zone Detail */}
      {sel && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="text-xs font-semibold text-studio-text">{sel.name}</div>
          <div className="grid grid-cols-2 gap-1 mt-1 text-[10px] text-studio-muted">
            <span>Population: {sel.population.toLocaleString()}</span>
            <span>Attack rate: {((sel.infected / sel.population) * 100).toFixed(2)}%</span>
            <span>Active: {(sel.infected - sel.recovered - sel.deaths).toLocaleString()}</span>
            <span>Local CFR: {((sel.deaths / sel.infected) * 100).toFixed(1)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default EpidemicPanel;

