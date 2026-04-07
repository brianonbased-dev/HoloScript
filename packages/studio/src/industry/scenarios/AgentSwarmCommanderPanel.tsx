import React, { useState, useEffect } from 'react';
import { SwarmAgent, simulateSwarmTick } from '@/lib/v6PlatformServices';

const s = {
  panel: {
    background: '#0a0a0a', border: '1px solid #333', borderRadius: 8, padding: 16,
    color: '#00ffcc', fontFamily: 'monospace', maxWidth: 600, minHeight: 400
  } as React.CSSProperties,
  header: { fontSize: 16, fontWeight: 800, marginBottom: 16, borderBottom: '1px solid #00ffcc', paddingBottom: 8 } as React.CSSProperties,
  grid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 } as React.CSSProperties,
  agentBox: { border: '1px solid #222', borderRadius: 4, padding: 8, textAlign: 'center' } as React.CSSProperties
};

export function AgentSwarmCommanderPanel() {
  const [agents, setAgents] = useState<SwarmAgent[]>([
    { id: 'alpha', role: 'coordinator', status: 'idle', battery: 100 },
    { id: 'worker-1', role: 'worker', status: 'executing', battery: 80 },
    { id: 'worker-2', role: 'worker', status: 'syncing', battery: 45 },
    { id: 'scout-1', role: 'scout', status: 'executing', battery: 15 },
  ]);

  useEffect(() => {
    const t = setInterval(() => setAgents(prev => simulateSwarmTick(prev)), 2000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={s.panel} data-testid="swarm-panel">
      <div style={s.header}>🌐 Agent Swarm Commander (P2P Mesh)</div>
      <div style={s.grid}>
        {agents.map(a => (
          <div key={a.id} style={{ ...s.agentBox, borderColor: a.status === 'executing' ? '#00ffcc' : '#333' }}>
            <div style={{ fontWeight: 'bold' }}>{a.id}</div>
            <div style={{ fontSize: 12, color: '#aaa' }}>{a.role}</div>
            <div style={{ color: a.status === 'executing' ? '#00ffcc' : '#ffaa00' }}>{a.status}</div>
            <div style={{ fontSize: 10, marginTop: 4 }}>🔋 {a.battery}%</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default AgentSwarmCommanderPanel;
