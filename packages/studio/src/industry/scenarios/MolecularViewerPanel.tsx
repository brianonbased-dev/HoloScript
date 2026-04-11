'use client';

/**
 * MolecularViewerPanel — Drug discovery panel for HoloScript Studio.
 *
 * Surfaces the molecularDesigner.ts engine:
 *  - PDB file upload & parsing
 *  - Lipinski's Rule of Five analysis
 *  - Drug-likeness scoring
 *  - Binding energy estimation
 *  - Pharmacophore feature detection
 *  - Atom/residue statistics
 *
 * This panel lets scientists load protein structures and evaluate
 * drug candidates without leaving the Studio.
 */

import { useState, useCallback } from 'react';
import {
  Atom,
  FlaskConical,
  FileUp,
  BarChart3,
  Shield,
  AlertTriangle,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import {
  parsePDB,
  checkLipinski,
  drugLikenessScore,
  _molecularFormula,
  _totalCharge,
  _moleculeCenter,
  _solventAccessibleSurface,
  pharmacophoreFeatures,
  type Molecule,
  type ProteinResidue,
  type LipinskiResult,
  type PharmacophoreFeature,
} from '@/lib/molecularDesigner';

type ViewMode = 'overview' | 'lipinski' | 'pharma' | 'residues';

export function MolecularViewerPanel() {
  const [_pdbText, setPdbText] = useState('');
  const [residues, setResidues] = useState<ProteinResidue[]>([]);
  const [molecule, setMolecule] = useState<Molecule | null>(null);
  const [lipinski, setLipinski] = useState<LipinskiResult | null>(null);
  const [pharma, setPharma] = useState<PharmacophoreFeature[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('overview');
  const [filename, setFilename] = useState<string>('');

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFilename(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setPdbText(text);
      const res = parsePDB(text);
      setResidues(res);
    };
    reader.readAsText(file);
  }, []);

  const _handleAnalyzeMolecule = useCallback(() => {
    if (!molecule) return;
    setLipinski(checkLipinski(molecule));
    setPharma(pharmacophoreFeatures(molecule));
  }, [molecule]);

  const handleDemoMolecule = useCallback(() => {
    // Demo: Aspirin-like molecule
    const demo: Molecule = {
      id: 'aspirin',
      name: 'Aspirin (Acetylsalicylic acid)',
      formula: 'C9H8O4',
      atoms: [
        { id: 'C1', element: 'C', position: { x: 0, y: 0, z: 0 }, charge: 0, radius: 1.7 },
        { id: 'C2', element: 'C', position: { x: 1.2, y: 0.7, z: 0 }, charge: 0, radius: 1.7 },
        { id: 'O1', element: 'O', position: { x: 2.4, y: 0, z: 0 }, charge: -0.3, radius: 1.52 },
        { id: 'O2', element: 'O', position: { x: 0, y: 1.4, z: 0 }, charge: -0.3, radius: 1.52 },
      ],
      bonds: [
        { atomA: 'C1', atomB: 'C2', order: 1, rotatable: false },
        { atomA: 'C2', atomB: 'O1', order: 2, rotatable: false },
        { atomA: 'C1', atomB: 'O2', order: 1, rotatable: true },
      ],
      molecularWeight: 180.16,
      logP: 1.2,
      hBondDonors: 1,
      hBondAcceptors: 4,
      rotatableBonds: 3,
      polarSurfaceArea: 63.6,
    };
    setMolecule(demo);
    setLipinski(checkLipinski(demo));
    setPharma(pharmacophoreFeatures(demo));
  }, []);

  const lipinskiScore = molecule ? drugLikenessScore(molecule) : 0;

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <FlaskConical className="h-4 w-4 text-cyan-400" />
        <h3 className="text-sm font-semibold text-studio-text">Molecular Viewer</h3>
      </div>

      {/* File Upload */}
      <div className="flex gap-2">
        <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-studio-border bg-studio-panel/50 px-3 py-2 text-xs text-studio-muted transition hover:border-cyan-500/40 hover:text-studio-text">
          <FileUp className="h-3.5 w-3.5" />
          {filename || 'Upload PDB file'}
          <input type="file" accept=".pdb,.ent" className="hidden" onChange={handleFileUpload} />
        </label>
        <button
          onClick={handleDemoMolecule}
          className="rounded-lg border border-studio-border bg-studio-panel/50 px-3 py-2 text-xs text-studio-muted transition hover:text-studio-text"
          title="Load demo molecule (Aspirin)"
        >
          Demo
        </button>
      </div>

      {/* View Mode Tabs */}
      <div className="flex gap-1 rounded-lg bg-studio-panel/50 p-1">
        {[
          { mode: 'overview' as ViewMode, label: 'Overview', icon: Atom },
          { mode: 'lipinski' as ViewMode, label: 'Lipinski', icon: Shield },
          { mode: 'pharma' as ViewMode, label: 'Pharma', icon: BarChart3 },
          { mode: 'residues' as ViewMode, label: 'Residues', icon: FlaskConical },
        ].map(({ mode, label, icon: Icon }) => (
          <button
            key={mode}
            onClick={() => setViewMode(mode)}
            className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[10px] transition ${
              viewMode === mode
                ? 'bg-cyan-500/20 text-cyan-400'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {viewMode === 'overview' && molecule && (
        <div className="flex flex-col gap-2 rounded-lg border border-studio-border bg-studio-panel/30 p-3 text-xs">
          <div className="text-sm font-semibold text-studio-text">{molecule.name}</div>
          <div className="grid grid-cols-2 gap-2 text-studio-muted">
            <div>
              Formula: <span className="text-studio-text">{molecule.formula}</span>
            </div>
            <div>
              MW: <span className="text-studio-text">{molecule.molecularWeight}</span>
            </div>
            <div>
              logP: <span className="text-studio-text">{molecule.logP}</span>
            </div>
            <div>
              HBD: <span className="text-studio-text">{molecule.hBondDonors}</span>
            </div>
            <div>
              HBA: <span className="text-studio-text">{molecule.hBondAcceptors}</span>
            </div>
            <div>
              PSA: <span className="text-studio-text">{molecule.polarSurfaceArea} Å²</span>
            </div>
            <div>
              Atoms: <span className="text-studio-text">{molecule.atoms.length}</span>
            </div>
            <div>
              Bonds: <span className="text-studio-text">{molecule.bonds.length}</span>
            </div>
          </div>
          {/* Drug-likeness gauge */}
          <div className="mt-1">
            <div className="mb-1 text-[10px] text-studio-muted">Drug-Likeness Score</div>
            <div className="h-2 w-full rounded-full bg-studio-panel">
              <div
                className={`h-2 rounded-full transition-all duration-500 ${
                  lipinskiScore >= 75
                    ? 'bg-emerald-500'
                    : lipinskiScore >= 50
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${lipinskiScore}%` }}
              />
            </div>
            <div className="mt-0.5 text-right text-[10px] text-studio-muted">
              {lipinskiScore}/100
            </div>
          </div>
        </div>
      )}

      {viewMode === 'lipinski' && lipinski && (
        <div className="flex flex-col gap-2 rounded-lg border border-studio-border bg-studio-panel/30 p-3 text-xs">
          <div className="flex items-center gap-2">
            {lipinski.passes ? (
              <CheckCircle className="h-4 w-4 text-emerald-400" />
            ) : (
              <XCircle className="h-4 w-4 text-red-400" />
            )}
            <span className={lipinski.passes ? 'text-emerald-400' : 'text-red-400'}>
              {lipinski.passes ? "Passes Lipinski's Rule of Five" : "Fails Lipinski's Rule of Five"}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mt-1">
            {[
              { label: 'MW ≤ 500', pass: lipinski.mw },
              { label: 'logP ≤ 5', pass: lipinski.logP },
              { label: 'HBD ≤ 5', pass: lipinski.hbd },
              { label: 'HBA ≤ 10', pass: lipinski.hba },
            ].map(({ label, pass }) => (
              <div
                key={label}
                className={`flex items-center gap-1 ${pass ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {pass ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                {label}
              </div>
            ))}
          </div>
          {lipinski.violations.length > 0 && (
            <div className="mt-1 text-amber-400">
              {lipinski.violations.map((v, i) => (
                <div key={i} className="flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" /> {v}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {viewMode === 'pharma' && pharma.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-studio-border bg-studio-panel/30 p-3 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
            Pharmacophore Features ({pharma.length})
          </div>
          {pharma.map((f, i) => (
            <div key={i} className="flex items-center justify-between text-studio-muted">
              <span className="text-studio-text capitalize">{f.type.replace(/-/g, ' ')}</span>
              <span className="font-mono text-[10px]">r={f.radius.toFixed(1)}Å</span>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'residues' && residues.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-studio-border bg-studio-panel/30 p-3 text-xs">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-studio-muted">
            Protein Residues ({residues.length})
          </div>
          <div className="max-h-48 overflow-y-auto">
            {residues.slice(0, 50).map((r) => (
              <div
                key={`${r.chain}:${r.id}`}
                className="flex items-center justify-between text-studio-muted py-0.5"
              >
                <span className="text-studio-text">{r.aminoAcid}</span>
                <span className="font-mono text-[10px]">
                  {r.chain}:{r.id}
                </span>
              </div>
            ))}
            {residues.length > 50 && (
              <div className="mt-1 text-center text-[10px] text-studio-muted">
                ...and {residues.length - 50} more
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty states */}
      {!molecule && viewMode !== 'residues' && (
        <div className="rounded-lg border border-dashed border-studio-border p-4 text-center text-xs text-studio-muted">
          Upload a PDB file or click "Demo" to load Aspirin
        </div>
      )}
      {residues.length === 0 && viewMode === 'residues' && (
        <div className="rounded-lg border border-dashed border-studio-border p-4 text-center text-xs text-studio-muted">
          Upload a PDB file to view residues
        </div>
      )}
    </div>
  );
}

export default MolecularViewerPanel;
