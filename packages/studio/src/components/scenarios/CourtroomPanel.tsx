/**
 * CourtroomPanel.tsx — Courtroom Evidence Presenter
 * Powered by courtroomEvidence.ts
 */
import React, { useState } from 'react';
import { admissibilityCheck, evidenceWeight, chainOfCustodyValid, timelineConflicts, type Evidence, type TimelineEvent } from '@/lib/courtroomEvidence';

const s = {
  panel: { background: 'linear-gradient(180deg, #0f0e12 0%, #18161e 100%)', borderRadius: 12, padding: 20, color: '#d8d0e0', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(139,92,246,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#8b5cf6', marginBottom: 10 } as React.CSSProperties,
};

export function CourtroomPanel() {
  const evidence: Evidence[] = [
    { id: 'e1', type: 'physical', name: 'Security Camera Footage', description: 'Video from lobby at 23:15', reliability: 0.95, source: 'Building security', timestamp: Date.now() - 86400000, custodyChain: ['Officer A', 'Evidence Room', 'Court'], admissible: true },
    { id: 'e2', type: 'testimonial', name: 'Witness X Statement', description: 'Placed defendant at scene', reliability: 0.6, source: 'Eyewitness', timestamp: Date.now() - 172800000, custodyChain: [], admissible: true },
    { id: 'e3', type: 'forensic', name: 'DNA Sample', description: 'Match probability 1 in 10B', reliability: 0.99, source: 'Crime lab', timestamp: Date.now() - 259200000, custodyChain: ['CSI Tech', 'Lab', 'Court'], admissible: true },
    { id: 'e4', type: 'digital', name: 'Phone Records', description: 'Cell tower pings near scene', reliability: 0.85, source: 'Carrier subpoena', timestamp: Date.now() - 345600000, custodyChain: ['Detective B', 'Court'], admissible: true },
  ];

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>⚖️ Courtroom Evidence</span>
        <span style={{ fontSize: 12, color: '#8b5cf6' }}>{evidence.length} exhibits</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📋 Evidence Registry</div>
        {evidence.map(e => {
          const adm = admissibilityCheck(e);
          const weight = evidenceWeight(e);
          const custody = chainOfCustodyValid(e);
          return (
            <div key={e.id} style={{ padding: '10px 12px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 6, borderLeft: `3px solid ${adm ? '#22c55e' : '#ef4444'}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span style={{ fontWeight: 600 }}>{e.name}</span>
                <span style={{ color: adm ? '#4ade80' : '#ef4444', fontWeight: 700, fontSize: 11 }}>{adm ? 'ADMISSIBLE' : 'EXCLUDED'}</span>
              </div>
              <div style={{ fontSize: 11, color: '#889', marginTop: 2 }}>{e.description}</div>
              <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 11 }}>
                <span style={{ color: '#a78bfa' }}>Type: {e.type}</span>
                <span style={{ color: '#f59e0b' }}>Weight: {weight}/10</span>
                <span style={{ color: custody ? '#4ade80' : '#ef4444' }}>Chain: {custody ? '✓ Valid' : '✗ Broken'}</span>
                <span style={{ color: '#889' }}>Reliability: {(e.reliability * 100).toFixed(0)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CourtroomPanel;
