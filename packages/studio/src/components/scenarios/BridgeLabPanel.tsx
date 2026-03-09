'use client';

/**
 * BridgeLabPanel — Structural engineering simulation with load testing.
 */

import { useState, useCallback } from 'react';
import {
  Building2,
  ArrowDown,
  AlertTriangle,
  CheckCircle,
  Ruler,
  Plus,
  BarChart3,
} from 'lucide-react';

export type BeamMaterial = 'steel' | 'concrete' | 'wood' | 'cable' | 'composite';
export type BridgeType = 'beam' | 'arch' | 'truss' | 'suspension' | 'cantilever';

export interface BridgeConfig {
  type: BridgeType;
  span: number;
  height: number;
  material: BeamMaterial;
  loadCapacity: number; // kN
  safetyFactor: number;
  cost: number;
}

const MATERIAL_PROPS: Record<
  BeamMaterial,
  { strength: number; density: number; costPerM: number; color: string }
> = {
  steel: { strength: 250, density: 7850, costPerM: 500, color: '#8888aa' },
  concrete: { strength: 30, density: 2400, costPerM: 200, color: '#999999' },
  wood: { strength: 12, density: 600, costPerM: 100, color: '#8B6914' },
  cable: { strength: 1200, density: 7800, costPerM: 800, color: '#444444' },
  composite: { strength: 150, density: 1600, costPerM: 1200, color: '#336699' },
};

export function BridgeLabPanel() {
  const [config, setConfig] = useState<BridgeConfig>({
    type: 'truss',
    span: 50,
    height: 10,
    material: 'steel',
    loadCapacity: 500,
    safetyFactor: 2.0,
    cost: 0,
  });
  const [testLoad, setTestLoad] = useState(100);
  const [testResult, setTestResult] = useState<{
    pass: boolean;
    stress: number;
    deflection: number;
  } | null>(null);

  const update = useCallback(
    (p: Partial<BridgeConfig>) => setConfig((prev) => ({ ...prev, ...p })),
    []
  );

  const runTest = useCallback(() => {
    const mat = MATERIAL_PROPS[config.material];
    const stress = (testLoad * config.span) / (4 * config.height * mat.strength);
    const deflection = (5 * testLoad * Math.pow(config.span, 3)) / (384 * mat.strength * 1000);
    const pass = stress < 1 / config.safetyFactor;
    setTestResult({ pass, stress: stress * 100, deflection });
  }, [config, testLoad]);

  const mat = MATERIAL_PROPS[config.material];
  const estimatedCost =
    config.span *
    mat.costPerM *
    (config.type === 'suspension' ? 3 : config.type === 'truss' ? 1.5 : 1);

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <Building2 className="h-4 w-4 text-sky-400" />
        <span className="text-sm font-semibold text-studio-text">Bridge Lab</span>
      </div>

      {/* Bridge Type */}
      <div className="grid grid-cols-5 gap-1 border-b border-studio-border p-2">
        {(['beam', 'arch', 'truss', 'suspension', 'cantilever'] as BridgeType[]).map((t) => (
          <button
            key={t}
            onClick={() => update({ type: t })}
            className={`rounded px-1 py-1 text-[9px] ${config.type === t ? 'bg-sky-500/20 text-sky-400' : 'text-studio-muted'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Material */}
      <div className="grid grid-cols-5 gap-1 border-b border-studio-border p-2">
        {(Object.keys(MATERIAL_PROPS) as BeamMaterial[]).map((m) => (
          <button
            key={m}
            onClick={() => update({ material: m })}
            className={`flex flex-col items-center gap-0.5 rounded px-1 py-1 text-[9px] ${config.material === m ? 'bg-sky-500/20 text-sky-400' : 'text-studio-muted'}`}
          >
            <div className="h-3 w-3 rounded" style={{ background: MATERIAL_PROPS[m].color }} />
            {m}
          </button>
        ))}
      </div>

      {/* Dimensions */}
      <div className="flex gap-2 border-b border-studio-border px-3 py-2">
        <label className="flex flex-col gap-0.5 flex-1 text-[10px] text-studio-muted">
          Span (m)
          <input
            type="number"
            value={config.span}
            min={5}
            step={5}
            onChange={(e) => update({ span: parseFloat(e.target.value) || 10 })}
            className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-xs text-studio-text outline-none"
          />
        </label>
        <label className="flex flex-col gap-0.5 flex-1 text-[10px] text-studio-muted">
          Height (m)
          <input
            type="number"
            value={config.height}
            min={1}
            step={1}
            onChange={(e) => update({ height: parseFloat(e.target.value) || 5 })}
            className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-xs text-studio-text outline-none"
          />
        </label>
        <label className="flex flex-col gap-0.5 flex-1 text-[10px] text-studio-muted">
          Safety Factor
          <input
            type="number"
            value={config.safetyFactor}
            min={1}
            step={0.1}
            onChange={(e) => update({ safetyFactor: parseFloat(e.target.value) || 1.5 })}
            className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-xs text-studio-text outline-none"
          />
        </label>
      </div>

      {/* Material Stats */}
      <div className="grid grid-cols-3 gap-2 border-b border-studio-border px-3 py-2 text-center text-[10px]">
        <div>
          <div className="text-studio-muted">Strength</div>
          <div className="font-mono text-studio-text">{mat.strength} MPa</div>
        </div>
        <div>
          <div className="text-studio-muted">Density</div>
          <div className="font-mono text-studio-text">{mat.density} kg/m³</div>
        </div>
        <div>
          <div className="text-studio-muted">Est. Cost</div>
          <div className="font-mono text-emerald-400">${(estimatedCost / 1000).toFixed(0)}k</div>
        </div>
      </div>

      {/* Load Test */}
      <div className="border-b border-studio-border px-3 py-2">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-studio-muted mb-1">
          Load Test
        </div>
        <div className="flex gap-2">
          <label className="flex flex-col gap-0.5 flex-1 text-[10px] text-studio-muted">
            Load (kN)
            <input
              type="number"
              value={testLoad}
              min={1}
              step={10}
              onChange={(e) => setTestLoad(parseInt(e.target.value) || 100)}
              className="rounded border border-studio-border bg-transparent px-1 py-0.5 text-xs text-studio-text outline-none"
            />
          </label>
          <button
            onClick={runTest}
            className="self-end rounded bg-sky-500/20 px-3 py-1 text-[10px] font-semibold text-sky-400 hover:bg-sky-500/30"
          >
            <ArrowDown className="inline h-3 w-3 mr-0.5" />
            Test
          </button>
        </div>
        {testResult && (
          <div
            className={`mt-2 flex items-center gap-2 rounded p-2 ${testResult.pass ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}
          >
            {testResult.pass ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-red-400" />
            )}
            <div className="text-[11px]">
              <span className={testResult.pass ? 'text-emerald-400' : 'text-red-400'}>
                {testResult.pass ? 'PASS' : 'FAIL'}
              </span>
              <span className="text-studio-muted ml-2">
                Stress: {testResult.stress.toFixed(1)}% · Deflection:{' '}
                {testResult.deflection.toFixed(2)}mm
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
