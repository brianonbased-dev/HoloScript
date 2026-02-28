/**
 * MolecularLabPanel.tsx — Molecular Drug Design Lab
 * Powered by molecularDesigner.ts
 */
import React, { useState, useMemo } from 'react';
import { molecularWeight, lippinskiRuleOfFive, drugLikenessScore, bindingAffinity, logPEstimate, type Molecule, type BindingSite } from '@/lib/molecularDesigner';

const s = {
  panel: { background: 'linear-gradient(180deg, #0a0f18 0%, #101828 100%)', borderRadius: 12, padding: 20, color: '#c8d8f0', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(59,130,246,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #3b82f6, #22c55e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(59,130,246,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#3b82f6', marginBottom: 10 } as React.CSSProperties,
};

export function MolecularLabPanel() {
  const molecules: Molecule[] = [
    { id: 'mol1', name: 'Aspirin', formula: 'C9H8O4', smiles: 'CC(=O)OC1=CC=CC=C1C(=O)O', mw: 180.16, logP: 1.2, hDonors: 1, hAcceptors: 4, rotBonds: 3, tpsa: 63.6 },
    { id: 'mol2', name: 'Ibuprofen', formula: 'C13H18O2', smiles: 'CC(C)CC1=CC=C(C=C1)C(C)C(=O)O', mw: 206.28, logP: 3.5, hDonors: 1, hAcceptors: 2, rotBonds: 4, tpsa: 37.3 },
    { id: 'mol3', name: 'Caffeine', formula: 'C8H10N4O2', smiles: 'CN1C=NC2=C1C(=O)N(C(=O)N2C)C', mw: 194.19, logP: -0.07, hDonors: 0, hAcceptors: 6, rotBonds: 0, tpsa: 58.4 },
    { id: 'mol4', name: 'Metformin', formula: 'C4H11N5', smiles: 'CN(C)C(=N)NC(=N)N', mw: 129.16, logP: -1.43, hDonors: 4, hAcceptors: 5, rotBonds: 2, tpsa: 91.5 },
  ];
  const [selected, setSelected] = useState('mol1');
  const mol = molecules.find(m => m.id === selected)!;
  const lipinski = useMemo(() => lippinskiRuleOfFive(mol), [selected]);
  const drugScore = useMemo(() => drugLikenessScore(mol), [selected]);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🧪 Molecular Lab</span>
        <span style={{ fontSize: 12, color: '#3b82f6' }}>Drug Design</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>💊 Compounds</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {molecules.map(m => (
            <button key={m.id} onClick={() => setSelected(m.id)} style={{ padding: '6px 12px', background: m.id === selected ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.03)', border: `1px solid ${m.id === selected ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 6, color: m.id === selected ? '#60a5fa' : '#889', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
              {m.name}
            </button>
          ))}
        </div>
        <div style={{ padding: 12, background: 'rgba(59,130,246,0.05)', borderRadius: 8 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#60a5fa' }}>{mol.name}</div>
          <div style={{ fontSize: 12, color: '#889', fontFamily: 'monospace' }}>{mol.formula} · {mol.smiles}</div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📊 Properties</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[['MW', `${mol.mw.toFixed(1)} Da`, '#3b82f6'], ['LogP', mol.logP.toFixed(2), '#22c55e'], ['TPSA', `${mol.tpsa.toFixed(1)} Å²`, '#f59e0b'],
            ['H-Donors', mol.hDonors.toString(), '#a78bfa'], ['H-Accept', mol.hAcceptors.toString(), '#06b6d4'], ['Rot. Bonds', mol.rotBonds.toString(), '#ec4899']
          ].map(([l, v, c]) => (
            <div key={l as string} style={{ textAlign: 'center', padding: 8, background: `${c}08`, border: `1px solid ${c}20`, borderRadius: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#667' }}>{l as string}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>✅ Lipinski's Rule of Five</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
          {[['MW ≤ 500', lipinski.mwOk], ['LogP ≤ 5', lipinski.logPOk], ['H-Donors ≤ 5', lipinski.hDonorsOk], ['H-Accept ≤ 10', lipinski.hAcceptorsOk]].map(([label, ok]) => (
            <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: 6, fontSize: 12 }}>
              <span style={{ color: ok ? '#4ade80' : '#ef4444' }}>{ok ? '✅' : '❌'}</span>
              <span>{label as string}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 8, fontSize: 13 }}>
          Drug-likeness: <span style={{ fontSize: 18, fontWeight: 700, color: drugScore >= 70 ? '#4ade80' : drugScore >= 40 ? '#fbbf24' : '#ef4444' }}>{drugScore}/100</span>
          <span style={{ marginLeft: 8, color: '#889', fontSize: 12 }}>{lipinski.passes ? '✅ Passes Ro5' : '❌ Fails Ro5'}</span>
        </div>
      </div>
    </div>
  );
}

export default MolecularLabPanel;
