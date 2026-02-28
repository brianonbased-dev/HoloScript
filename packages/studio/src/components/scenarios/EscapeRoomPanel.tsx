/**
 * EscapeRoomPanel.tsx — Escape Room Designer
 * Powered by escapeRoomDesigner.ts
 */
import React, { useState, useMemo } from 'react';
import { createPuzzle, solvePuzzle, getHint, roomProgress, isPuzzleUnlocked, type EscapeRoom, type Puzzle } from '@/lib/escapeRoomDesigner';

const s = {
  panel: { background: 'linear-gradient(180deg, #0d1015 0%, #151a22 100%)', borderRadius: 12, padding: 20, color: '#c8d8e8', fontFamily: "'Inter', sans-serif", minHeight: 600, maxWidth: 720 } as React.CSSProperties,
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, borderBottom: '1px solid rgba(245,158,11,0.15)', paddingBottom: 12 } as React.CSSProperties,
  title: { fontSize: 18, fontWeight: 700, background: 'linear-gradient(135deg, #f59e0b, #ef4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' } as React.CSSProperties,
  section: { marginBottom: 18, padding: 14, background: 'rgba(255,255,255,0.02)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.08)' } as React.CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 600, textTransform: 'uppercase' as const, letterSpacing: '0.5px', color: '#f59e0b', marginBottom: 10 } as React.CSSProperties,
};

export function EscapeRoomPanel() {
  const initialPuzzles: Puzzle[] = [
    createPuzzle('p1', 'Cipher Lock', 'Decode the message on the wall', 'RAVEN', [], 3, 'easy', 5),
    createPuzzle('p2', 'Hidden Key', 'Find the UV-lit key', 'DRAWER', ['p1'], 2, 'medium', 8),
    createPuzzle('p3', 'Final Safe', 'Open the safe to escape', '4729', ['p1', 'p2'], 3, 'hard', 12),
  ];

  const [puzzles, setPuzzles] = useState(initialPuzzles);
  const [answer, setAnswer] = useState('');
  const [selectedId, setSelectedId] = useState('p1');

  const room: EscapeRoom = { id: 'r1', name: 'The Vault', theme: 'heist', puzzles, timeLimitMin: 60, maxPlayers: 6, difficulty: 'medium' };
  const progress = useMemo(() => roomProgress(room), [puzzles]);
  const selected = puzzles.find(p => p.id === selectedId)!;
  const unlocked = useMemo(() => isPuzzleUnlocked(selected, puzzles), [selected, puzzles]);

  const tryAnswer = () => {
    const updated = puzzles.map(p => p.id === selectedId ? solvePuzzle(p, answer) : p);
    setPuzzles(updated);
    setAnswer('');
  };

  return (
    <div style={s.panel}>
      <div style={s.header}>
        <span style={s.title}>🔐 Escape Room Designer</span>
        <span style={{ fontSize: 12, color: '#f59e0b' }}>{Math.round(progress * 100)}% Solved</span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🧩 Puzzles</div>
        {puzzles.map(p => {
          const isUnlocked = isPuzzleUnlocked(p, puzzles);
          return (
            <div key={p.id} onClick={() => isUnlocked && setSelectedId(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: p.id === selectedId ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.03)', border: `1px solid ${p.id === selectedId ? 'rgba(245,158,11,0.3)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 6, marginBottom: 4, fontSize: 12, cursor: isUnlocked ? 'pointer' : 'not-allowed', opacity: isUnlocked ? 1 : 0.5 }}>
              <span style={{ fontSize: 16 }}>{p.solved ? '✅' : isUnlocked ? '🔓' : '🔒'}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600 }}>{p.name}</div>
                <div style={{ color: '#667', fontSize: 11 }}>{p.clue} · {p.difficulty} · {p.points}pts</div>
              </div>
              <span style={{ color: '#889', fontSize: 11 }}>Hints: {p.hintsUsed}/{p.hints.length}</span>
            </div>
          );
        })}
        <div style={{ height: 8, background: 'rgba(255,255,255,0.05)', borderRadius: 4, marginTop: 8 }}>
          <div style={{ height: '100%', width: `${progress * 100}%`, background: 'linear-gradient(90deg, #f59e0b, #4ade80)', borderRadius: 4, transition: 'width 0.3s' }} />
        </div>
      </div>

      {unlocked && !selected.solved && (
        <div style={s.section}>
          <div style={s.sectionTitle}>💡 Solve: {selected.name}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Enter answer..."
              style={{ flex: 1, padding: '8px 12px', background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 6, color: '#c8d8e8', fontSize: 13, outline: 'none' }} />
            <button onClick={tryAnswer} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #f59e0b, #ef4444)', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Submit</button>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: '#889' }}>
            Hint: {getHint(selected, selected.hintsUsed) || 'No more hints'}
          </div>
        </div>
      )}
    </div>
  );
}

export default EscapeRoomPanel;
