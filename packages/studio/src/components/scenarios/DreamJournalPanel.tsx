/**
 * DreamJournalPanel.tsx — Dream Journal Visualizer
 * Powered by dreamJournal.ts
 */
import React, { useState, useMemo } from 'react';
import { lucidityScore, dreamMoodAverage, recurringSymbols, dreamsByTag, dreamDurationMinutes, sleepQualityScore, type DreamEntry, type DreamMood } from '@/lib/dreamJournal';

const MOOD_EMOJIS: Record<DreamMood, string> = { joyful: '😊', peaceful: '😌', anxious: '😰', fearful: '😨', sad: '😢', neutral: '😐', excited: '🤩', confused: '😵', angry: '😡' };
const MOOD_COLORS: Record<DreamMood, string> = { joyful: '#fbbf24', peaceful: '#22c55e', anxious: '#f59e0b', fearful: '#ef4444', sad: '#3b82f6', neutral: '#6b7280', excited: '#ec4899', confused: '#8b5cf6', angry: '#dc2626' };

const s = {
  panel: { background: 'linear-gradient(180deg, #0d0a1e 0%, #15102a 100%)', borderRadius: 12, padding: 20, color: '#d0c0f0', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(139,92,246,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #8b5cf6, #ec4899)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(139,92,246,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#8b5cf6', marginBottom: 10 } as React.CSSProperties,
};

export function DreamJournalPanel() {
  const dreams: DreamEntry[] = [
    { id: 'd1', date: '2026-02-26', title: 'Flying over mountains', narrative: 'Soaring above peaks with vivid colors', mood: 'joyful', lucidity: 8, vividness: 9, sleepHours: 7.5, tags: ['flying', 'nature'], symbols: ['mountain', 'sky', 'wings'], characters: ['self'], timeOfNight: 'late' },
    { id: 'd2', date: '2026-02-27', title: 'Lost in a maze', narrative: 'Wandering through shifting corridors', mood: 'anxious', lucidity: 3, vividness: 7, sleepHours: 6, tags: ['maze', 'chase'], symbols: ['door', 'maze', 'shadow'], characters: ['self', 'stranger'], timeOfNight: 'middle' },
    { id: 'd3', date: '2026-02-28', title: 'Ocean descent', narrative: 'Swimming deeper into glowing waters', mood: 'peaceful', lucidity: 6, vividness: 8, sleepHours: 8, tags: ['water', 'nature'], symbols: ['ocean', 'light', 'fish'], characters: ['self'], timeOfNight: 'early' },
    { id: 'd4', date: '2026-02-25', title: 'Time loop classroom', narrative: 'Repeated the same exam over and over', mood: 'confused', lucidity: 5, vividness: 6, sleepHours: 7, tags: ['school', 'loop'], symbols: ['clock', 'door', 'book'], characters: ['teacher', 'self'], timeOfNight: 'late' },
  ];

  const avgMood = useMemo(() => dreamMoodAverage(dreams), []);
  const recurring = useMemo(() => recurringSymbols(dreams), []);
  const nature = useMemo(() => dreamsByTag(dreams, 'nature'), []);

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>💭 Dream Journal</span>
        <span style={{ fontSize: 12, color: '#8b5cf6' }}>{dreams.length} entries</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>📖 Recent Dreams</div>
        {dreams.map(d => (
          <div key={d.id} style={{ padding: '8px 10px', background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginBottom: 6, borderLeft: `3px solid ${MOOD_COLORS[d.mood]}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 600 }}>{MOOD_EMOJIS[d.mood]} {d.title}</span>
              <span style={{ color: '#667' }}>{d.date}</span>
            </div>
            <div style={{ fontSize: 11, color: '#889', marginTop: 2 }}>{d.narrative}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11 }}>
              <span style={{ color: '#8b5cf6' }}>Lucidity: {d.lucidity}/10</span>
              <span style={{ color: '#ec4899' }}>Vividness: {d.vividness}/10</span>
              <span style={{ color: '#06b6d4' }}>{d.sleepHours}h sleep</span>
            </div>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🔮 Recurring Symbols</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {recurring.map(([sym, count]) => (
            <span key={sym} style={{ padding: '3px 8px', background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.2)', borderRadius: 10, fontSize: 11, color: '#c4b5fd' }}>
              {sym} ×{count}
            </span>
          ))}
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>😊 Mood Distribution</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {dreams.map(d => (
            <span key={d.id} style={{ fontSize: 24, cursor: 'default' }} title={`${d.title}: ${d.mood}`}>{MOOD_EMOJIS[d.mood]}</span>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 12, color: '#889' }}>
          Avg sleep quality: <span style={{ color: '#22c55e', fontWeight: 600 }}>{sleepQualityScore(dreams).toFixed(1)}/10</span>
        </div>
      </div>
    </div>
  );
}

export default DreamJournalPanel;
