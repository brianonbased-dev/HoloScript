import React, { useState } from 'react';
import { SandboxRequest, validateStdlibPolicy } from '@/lib/v6PlatformServices';

const s = {
  panel: {
    background: '#111827', border: '1px solid #374151', borderRadius: 8, padding: 16,
    color: '#9ca3af', fontFamily: 'monospace', maxWidth: 600, minHeight: 400
  } as React.CSSProperties,
  header: { fontSize: 16, fontWeight: 800, marginBottom: 16, borderBottom: '1px solid #374151', paddingBottom: 8, color: '#f87171' } as React.CSSProperties,
};

export function SandboxAuditorPanel() {
  const [trustLevel, setTrustLevel] = useState(40);
  const reqs: SandboxRequest[] = [
    { op: 'gpu_compute', source: 'plugin-a' },
    { op: 'fs_write', source: 'plugin-b' },
    { op: 'net_fetch', source: 'untrusted_agent' }
  ];

  return (
    <div style={s.panel} data-testid="sandbox-panel">
      <div style={s.header}>🛡️ Rbac Sandbox Auditor</div>
      <div style={{ marginBottom: 10 }}>Trust Level: {trustLevel} <input type="range" min="0" max="100" value={trustLevel} onChange={e => setTrustLevel(Number(e.target.value))} /></div>
      
      {reqs.map((req, i) => {
        const { allowed, reason } = validateStdlibPolicy(req, trustLevel);
        return (
          <div key={i} style={{ padding: 8, background: '#1f2937', marginBottom: 4, borderRadius: 4 }}>
            <span style={{ color: '#60a5fa' }}>{req.source}</span> → <span style={{ color: '#d8b4fe' }}>{req.op}</span>
            <div style={{ color: allowed ? '#34d399' : '#ef4444', fontSize: 12 }}>
              {allowed ? '✅ PERMITTED' : `❌ BLOCKED: ${reason}`}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default SandboxAuditorPanel;
