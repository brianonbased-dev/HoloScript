import React, { useState, useEffect, useMemo } from 'react';
import { AbsorbTask, advanceAbsorbFunnel, calculateFunnelEfficiency } from '@/lib/absorbOrchestration';

const s = {
  panel: {
    background: '#09090b',
    border: '1px solid #27272a',
    borderRadius: 12,
    padding: 20,
    color: '#e4e4e7',
    fontFamily: "'JetBrains Mono', monospace",
    minHeight: 500,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid #3f3f46',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#d946ef', // Fuchsia
  } as React.CSSProperties,
  box: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(217, 70, 239, 0.2)',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16
  } as React.CSSProperties,
  progressBar: {
    height: 6,
    background: '#27272a',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 8
  } as React.CSSProperties
};

export function AbsorbOrchestratorPanel() {
  const [tasks, setTasks] = useState<AbsorbTask[]>([
    { id: 'task-101', objective: 'Refactor Core Rendering', phase: 'idle', knowledgeTokensProcessed: 0, progressPercent: 0 },
    { id: 'task-102', objective: 'Synthesize RFI Filter rules', phase: 'graph_rag_query', knowledgeTokensProcessed: 2500, progressPercent: 20 },
    { id: 'task-103', objective: 'Deploy Swarm Protocol', phase: 'board_claim', knowledgeTokensProcessed: 5500, progressPercent: 60 },
  ]);

  const efficiency = useMemo(() => calculateFunnelEfficiency(tasks), [tasks]);

  useEffect(() => {
    const t = setInterval(() => {
      setTasks(prev => advanceAbsorbFunnel(prev));
    }, 2500);
    return () => clearInterval(t);
  }, []);

  const getPhaseColor = (p: string) => {
    switch(p) {
      case 'idle': return '#71717a';
      case 'graph_rag_query': return '#3b82f6';
      case 'compress_knowledge': return '#8b5cf6';
      case 'board_claim': return '#f59e0b';
      case 'execute': return '#10b981';
      case 'contribute': return '#ec4899';
      default: return '#fff';
    }
  };

  return (
    <div style={s.panel} data-testid="absorb-orchestrator-panel">
      <div style={s.header}>
        <span style={s.title}>🌀 Absorb & Orchestration Funnel</span>
        <span style={{ fontSize: 12, color: efficiency > 80 ? '#10b981' : '#f59e0b', fontWeight: 'bold' }}>
          FUNNEL EFFICIENCY: {efficiency.toFixed(1)}%
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div style={{...s.box, textAlign: 'center'}}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#3b82f6' }}>{tasks.reduce((a, t) => a + t.knowledgeTokensProcessed, 0)}</div>
          <div style={{ fontSize: 10, color: '#a1a1aa' }}>TOTAL TOKENS ABSORBED</div>
        </div>
        <div style={{...s.box, textAlign: 'center'}}>
          <div style={{ fontSize: 28, fontWeight: 'bold', color: '#10b981' }}>{tasks.filter(t => t.phase === 'execute').length}</div>
          <div style={{ fontSize: 10, color: '#a1a1aa' }}>AGENTS IN EXECUTION</div>
        </div>
      </div>

      <div style={s.box}>
        <div style={{ fontSize: 12, fontWeight: 'bold', color: '#d946ef', marginBottom: 12 }}>ACTIVE IDE SQUAD TASKS</div>
        {tasks.map(t => (
          <div key={t.id} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>{t.objective}</span>
              <span style={{ color: getPhaseColor(t.phase), fontWeight: 'bold' }}>{t.phase.toUpperCase()}</span>
            </div>
            <div style={s.progressBar}>
              <div style={{ 
                width: `${t.progressPercent}%`, 
                height: '100%', 
                background: getPhaseColor(t.phase),
                transition: 'width 0.5s, background 0.5s' 
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AbsorbOrchestratorPanel;
