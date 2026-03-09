'use client';

/**
 * MolecularLabPanel — Molecular visualization and analysis dashboard.
 * Lighter version focused on quick analysis; full version in MolecularViewerPanel.
 */

import { useState, useMemo } from 'react';
import { Atom, FlaskConical, Search, BarChart3, Shield, CheckCircle, XCircle } from 'lucide-react';

export interface QuickMolecule {
  id: string;
  name: string;
  formula: string;
  mw: number;
  logP: number;
  hbd: number;
  hba: number;
  psa: number;
  rotBonds: number;
}

const DEMO_MOLECULES: QuickMolecule[] = [
  {
    id: '1',
    name: 'Aspirin',
    formula: 'C₉H₈O₄',
    mw: 180.16,
    logP: 1.2,
    hbd: 1,
    hba: 4,
    psa: 63.6,
    rotBonds: 3,
  },
  {
    id: '2',
    name: 'Ibuprofen',
    formula: 'C₁₃H₁₈O₂',
    mw: 206.28,
    logP: 3.5,
    hbd: 1,
    hba: 2,
    psa: 37.3,
    rotBonds: 4,
  },
  {
    id: '3',
    name: 'Caffeine',
    formula: 'C₈H₁₀N₄O₂',
    mw: 194.19,
    logP: -0.07,
    hbd: 0,
    hba: 6,
    psa: 58.4,
    rotBonds: 0,
  },
  {
    id: '4',
    name: 'Paracetamol',
    formula: 'C₈H₉NO₂',
    mw: 151.16,
    logP: 0.46,
    hbd: 2,
    hba: 3,
    psa: 49.3,
    rotBonds: 1,
  },
  {
    id: '5',
    name: 'Metformin',
    formula: 'C₄H₁₁N₅',
    mw: 129.16,
    logP: -1.4,
    hbd: 3,
    hba: 5,
    psa: 91.5,
    rotBonds: 2,
  },
  {
    id: '6',
    name: 'Atorvastatin',
    formula: 'C₃₃H₃₅FN₂O₅',
    mw: 558.64,
    logP: 6.36,
    hbd: 4,
    hba: 7,
    psa: 111.8,
    rotBonds: 12,
  },
];

function lipinskiCheck(m: QuickMolecule): { passes: boolean; violations: string[] } {
  const violations: string[] = [];
  if (m.mw > 500) violations.push(`MW ${m.mw} > 500`);
  if (m.logP > 5) violations.push(`logP ${m.logP} > 5`);
  if (m.hbd > 5) violations.push(`HBD ${m.hbd} > 5`);
  if (m.hba > 10) violations.push(`HBA ${m.hba} > 10`);
  return { passes: violations.length <= 1, violations };
}

function drugScore(m: QuickMolecule): number {
  let s = 100;
  if (m.mw > 500) s -= 25;
  else if (m.mw > 400) s -= 10;
  if (m.logP > 5) s -= 25;
  else if (m.logP > 3) s -= 10;
  else if (m.logP < -1) s -= 15;
  if (m.hbd > 5) s -= 20;
  if (m.hba > 10) s -= 20;
  if (m.rotBonds > 10) s -= 15;
  if (m.psa > 140) s -= 20;
  return Math.max(0, s);
}

export function MolecularLabPanel() {
  const [molecules] = useState<QuickMolecule[]>(DEMO_MOLECULES);
  const [selected, setSelected] = useState<string>('1');
  const [search, setSearch] = useState('');

  const filtered = molecules.filter(
    (m) =>
      !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.formula.includes(search)
  );
  const sel = molecules.find((m) => m.id === selected);
  const selLipinski = sel ? lipinskiCheck(sel) : null;
  const selScore = sel ? drugScore(sel) : 0;

  return (
    <div className="flex flex-col overflow-auto">
      <div className="flex items-center gap-2 border-b border-studio-border px-3 py-2">
        <FlaskConical className="h-4 w-4 text-cyan-400" />
        <span className="text-sm font-semibold text-studio-text">Molecular Lab</span>
      </div>

      <div className="flex items-center gap-1 border-b border-studio-border px-2 py-1">
        <Search className="h-3 w-3 text-studio-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search molecules..."
          className="flex-1 bg-transparent text-xs text-studio-text outline-none"
        />
      </div>

      {/* Molecule List */}
      {filtered.map((m) => {
        const score = drugScore(m);
        return (
          <div
            key={m.id}
            onClick={() => setSelected(m.id)}
            className={`flex items-center gap-2 border-b border-studio-border/30 px-3 py-2 cursor-pointer ${selected === m.id ? 'bg-cyan-500/10' : 'hover:bg-studio-panel/50'}`}
          >
            <Atom className="h-3 w-3 text-studio-muted/40" />
            <div className="flex-1">
              <div className="text-xs font-semibold text-studio-text">{m.name}</div>
              <div className="text-[10px] text-studio-muted">
                {m.formula} · MW {m.mw}
              </div>
            </div>
            <div
              className={`rounded px-1.5 py-0.5 text-[9px] font-mono ${score >= 75 ? 'bg-emerald-500/20 text-emerald-400' : score >= 50 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}
            >
              {score}
            </div>
          </div>
        );
      })}

      {/* Detail */}
      {sel && selLipinski && (
        <div className="border-t border-studio-border px-3 py-2">
          <div className="text-xs font-semibold text-studio-text mb-1">{sel.name}</div>

          <div className="grid grid-cols-3 gap-1 mb-2 text-center text-[10px]">
            <div className="rounded bg-studio-panel p-1">
              <div className="text-studio-muted">MW</div>
              <div className="text-studio-text">{sel.mw}</div>
            </div>
            <div className="rounded bg-studio-panel p-1">
              <div className="text-studio-muted">logP</div>
              <div className="text-studio-text">{sel.logP}</div>
            </div>
            <div className="rounded bg-studio-panel p-1">
              <div className="text-studio-muted">PSA</div>
              <div className="text-studio-text">{sel.psa}Å²</div>
            </div>
          </div>

          {/* Lipinski */}
          <div className="flex items-center gap-1 mb-1">
            {selLipinski.passes ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-400" />
            )}
            <span
              className={`text-[11px] ${selLipinski.passes ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {selLipinski.passes ? 'Lipinski OK' : 'Lipinski Fail'}
            </span>
          </div>
          {selLipinski.violations.length > 0 &&
            selLipinski.violations.map((v, i) => (
              <div key={i} className="text-[10px] text-red-400/70 ml-5">
                ⚠ {v}
              </div>
            ))}

          {/* Drug-likeness gauge */}
          <div className="mt-2">
            <div className="flex justify-between text-[9px] text-studio-muted">
              <span>Drug-Likeness</span>
              <span>{selScore}/100</span>
            </div>
            <div className="h-2 rounded-full bg-studio-panel">
              <div
                className={`h-2 rounded-full transition-all ${selScore >= 75 ? 'bg-emerald-500' : selScore >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{ width: `${selScore}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
