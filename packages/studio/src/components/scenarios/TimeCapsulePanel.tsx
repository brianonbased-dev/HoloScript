/**
 * TimeCapsulePanel.tsx — Time Capsule Creator
 * Powered by timeCapsule.ts
 */
import React, { useState, useMemo } from 'react';
import { timeCapsuleAge, isOpenable, preservationScore, totalItems, capsuleSummary, type TimeCapsule, type CapsuleItem } from '@/lib/timeCapsule';

const TYPE_EMOJIS: Record<string, string> = { letter: '✉️', photo: '📷', artifact: '🏺', digital: '💾', document: '📄', other: '📦' };

const s = {
  panel: { background: 'linear-gradient(180deg, #0f1215 0%, #151a20 100%)', borderRadius: 12, padding: 20, color: '#c8d8e8', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(6,182,212,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(6,182,212,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#06b6d4', marginBottom: 10 } as React.CSSProperties,
};

export function TimeCapsulePanel() {
  const capsule: TimeCapsule = {
    id: 'tc1', name: 'Class of 2026', sealedDate: new Date('2026-06-15').getTime(), openDate: new Date('2051-06-15').getTime(),
    location: 'School Courtyard', coordinators: ['Principal Lee', 'Student Council'],
    items: [
      { id: 'i1', type: 'letter', name: 'Letters to Future Selves', description: 'Sealed envelopes from each student', addedBy: 'Students', condition: 'sealed', preservationType: 'vacuum-sealed' },
      { id: 'i2', type: 'photo', name: 'Class Photo 2026', description: 'Graduation day group photo', addedBy: 'Yearbook', condition: 'mint', preservationType: 'laminated' },
      { id: 'i3', type: 'digital', name: 'USB Drive', description: 'Videos, playlists, social media snapshots', addedBy: 'Tech Club', condition: 'new', preservationType: 'waterproof-case' },
      { id: 'i4', type: 'artifact', name: 'School Newspaper', description: 'Final edition of The Beacon', addedBy: 'Journalism', condition: 'good', preservationType: 'acid-free-paper' },
      { id: 'i5', type: 'other', name: 'Fidget Spinner', description: '2020s cultural artifact', addedBy: 'Class Historian', condition: 'used', preservationType: 'none' },
    ],
  };

  const age = useMemo(() => timeCapsuleAge(capsule), []);
  const canOpen = useMemo(() => isOpenable(capsule), []);
  const preservation = useMemo(() => preservationScore(capsule), []);
  const summary = useMemo(() => capsuleSummary(capsule), []);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>⏳ Time Capsule</span>
        <span style={{ fontSize: 12, color: canOpen ? '#4ade80' : '#f59e0b' }}>{canOpen ? '🔓 Ready to Open' : '🔒 Sealed'}</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📦 {capsule.name}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
          {[['Age', `${age.toFixed(1)} yrs`, '#06b6d4'], ['Items', totalItems(capsule).toString(), '#8b5cf6'], ['Preservation', `${preservation}/10`, '#22c55e']].map(([l, v, c]) => (
            <div key={l as string} style={{ textAlign: 'center', padding: 10, background: `${c}08`, border: `1px solid ${c}20`, borderRadius: 6 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c as string }}>{v}</div>
              <div style={{ fontSize: 10, color: '#889' }}>{l as string}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: '#889' }}>
          Sealed: {new Date(capsule.sealedDate).toLocaleDateString()} → Opens: {new Date(capsule.openDate).toLocaleDateString()}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🗃️ Contents</div>
        {capsule.items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 4, fontSize: 12 }}>
            <span style={{ fontSize: 16 }}>{TYPE_EMOJIS[item.type] || '📦'}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600 }}>{item.name}</div>
              <div style={{ fontSize: 11, color: '#889' }}>{item.description}</div>
            </div>
            <span style={{ color: '#667', fontSize: 11 }}>{item.preservationType}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default TimeCapsulePanel;
