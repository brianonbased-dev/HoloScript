import React, { useState, useMemo } from 'react';
import {
  ArchitectureType,
  RouteEndpoint,
  calculateSpatialSyncLatency,
  estimateStateMutationCost,
  validateSpatialMapping,
} from '@/lib/nonspatialScenario';

const s = {
  panel: {
    background: 'linear-gradient(180deg, #1e1e24 0%, #2b2b36 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#e2e8f0',
    fontFamily: "'Inter', sans-serif",
    minHeight: 500,
    maxWidth: 720,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(168, 85, 247, 0.2)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    background: 'linear-gradient(135deg, #a855f7, #d946ef)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    border: '1px solid rgba(168, 85, 247, 0.1)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
    color: '#d946ef',
    marginBottom: 10,
  } as React.CSSProperties,
};

export function NonSpatialDeveloperPanel() {
  const [architecture] = useState<ArchitectureType>('serverless');
  const [concurrentUsers] = useState<number>(1500);

  const endpoints: RouteEndpoint[] = useMemo(() => [
    { path: '/api/v1/auth', method: 'POST', dataPayloadKb: 1.2 },
    { path: '/api/v1/user/inventory', method: 'GET', dataPayloadKb: 45.0 },
    { path: '/api/v1/game/worldState', method: 'GET', dataPayloadKb: 6000.0 }, // Huge payload warning
    { path: 'ws://game-server', method: 'WS', dataPayloadKb: 0.5 },
  ], []);

  const latency = useMemo(() => calculateSpatialSyncLatency(architecture, concurrentUsers), [architecture, concurrentUsers]);
  const mutationCost = useMemo(() => estimateStateMutationCost(endpoints), [endpoints]);
  const validation = useMemo(() => validateSpatialMapping(endpoints), [endpoints]);

  return (
    <div style={s.panel} data-testid="nonspatial-dev-panel">
      <div style={s.header}>
        <span style={s.title}>💻 Traditional to Spatial Mapping</span>
        <span style={{ fontSize: 12, color: '#d946ef', fontWeight: 700 }}>
          ARCH: {architecture.toUpperCase()}
        </span>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🌐 Network Sync Analysis</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          <div style={{ padding: 10, background: 'rgba(168, 85, 247, 0.05)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: latency > 500 ? '#ef4444' : '#a855f7', fontWeight: 'bold' }}>{latency.toFixed(0)} ms</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>P99 Sync Latency</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(56, 189, 248, 0.05)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#38bdf8', fontWeight: 'bold' }}>{concurrentUsers}</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>Concurrent Conn.</div>
          </div>
          <div style={{ padding: 10, background: 'rgba(236, 72, 153, 0.05)', borderRadius: 6, textAlign: 'center' }}>
            <div style={{ fontSize: 18, color: '#ec4899', fontWeight: 'bold' }}>{mutationCost.toFixed(0)}</div>
            <div style={{ fontSize: 10, color: '#9ca3af' }}>Mutation Cost Index</div>
          </div>
        </div>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>⚙️ Endpoints & Traffic Profile</div>
        {endpoints.map((ep, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255,255,255,0.02)', marginBottom: 4, borderRadius: 4, fontSize: 12 }}>
            <span style={{ fontWeight: 600, width: 60, color: ep.method === 'WS' ? '#34d399' : (ep.method === 'GET' ? '#60a5fa' : '#f59e0b') }}>{ep.method}</span>
            <span style={{ flex: 1, fontFamily: 'monospace', color: '#e2e8f0' }}>{ep.path}</span>
            <span style={{ color: ep.dataPayloadKb > 500 ? '#ef4444' : '#9ca3af' }}>{ep.dataPayloadKb} KB</span>
          </div>
        ))}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>🛡️ Spatial Readiness Audit</div>
        {validation.valid ? (
          <div style={{ color: '#34d399', fontSize: 12, fontWeight: 'bold' }}>✅ All endpoints spatially optimized!</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {validation.warnings.map((warn, i) => (
              <div key={i} style={{ padding: 8, background: 'rgba(239, 68, 68, 0.1)', borderLeft: '3px solid #ef4444', borderRadius: 4, fontSize: 12, color: '#fca5a5' }}>
                ⚠️ {warn}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default NonSpatialDeveloperPanel;
