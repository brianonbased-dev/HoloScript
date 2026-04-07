import React, { useState, useMemo } from 'react';
import {
  NetworkNode,
  evaluateThreatLevel,
  isolateCompromisedNodes,
  generateFirewallRule,
} from '@/lib/threatIntelligence';

const s = {
  panel: {
    background: 'linear-gradient(180deg, #020617 0%, #0f172a 100%)',
    borderRadius: 12,
    padding: 20,
    color: '#94a3b8',
    fontFamily: "'Fira Code', monospace",
    minHeight: 500,
    maxWidth: 750,
  } as React.CSSProperties,
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottom: '1px solid rgba(16, 185, 129, 0.2)',
    paddingBottom: 12,
  } as React.CSSProperties,
  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#10b981',
    textShadow: '0 0 10px rgba(16, 185, 129, 0.5)',
  } as React.CSSProperties,
  section: {
    marginBottom: 18,
    padding: 14,
    background: 'rgba(0,0,0,0.3)',
    borderRadius: 8,
    border: '1px solid rgba(34, 197, 94, 0.1)',
  } as React.CSSProperties,
  sectionTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: '#34d399',
    marginBottom: 10,
    letterSpacing: '0.5px',
  } as React.CSSProperties,
};

export function ThreatIntelligencePanel() {
  const [nodes, setNodes] = useState<NetworkNode[]>([
    { id: 'node-alpha', ip: '192.168.1.10', status: 'active', encryptionProtocols: ['TLSv1.3'], anomalousTrafficKbps: 0 },
    { id: 'node-beta', ip: '192.168.1.11', status: 'active', encryptionProtocols: ['TLSv1.3'], anomalousTrafficKbps: 1500 },
    { id: 'node-gamma', ip: '10.0.0.5', status: 'compromised', encryptionProtocols: ['TLSv1.2'], anomalousTrafficKbps: 8500 },
    { id: 'node-delta', ip: '10.0.0.6', status: 'offline', encryptionProtocols: ['IPSec'], anomalousTrafficKbps: 0 },
  ]);

  const threatLevel = useMemo(() => evaluateThreatLevel(nodes), [nodes]);

  const handleIsolate = () => {
    setNodes(prev => isolateCompromisedNodes(prev));
  };

  const getThreatColor = (level: string) => {
    switch(level) {
      case 'SEVERE': return '#dc2626';
      case 'HIGH': return '#ef4444';
      case 'ELEVATED': return '#f59e0b';
      case 'GUARDED': return '#eab308';
      default: return '#10b981';
    }
  };

  return (
    <div style={s.panel} data-testid="threat-intel-panel">
      <div style={s.header}>
        <span style={s.title}>[ SOC ] Threat Intelligence Center</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12 }}>DEFCON LEVEL:</span>
          <span style={{ fontSize: 14, color: getThreatColor(threatLevel), fontWeight: 900 }}>
            {threatLevel}
          </span>
        </div>
      </div>

      <div style={s.section}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={s.sectionTitle}>Global Node Registry</div>
          <button 
            onClick={handleIsolate}
            style={{ padding: '6px 12px', background: 'rgba(220, 38, 38, 0.1)', color: '#ef4444', border: '1px solid #ef4444', borderRadius: 4, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11 }}
          >
            ! INITIATE ISOLATION PROTOCOL
          </button>
        </div>
        
        <table style={{ width: '100%', fontSize: 11, textAlign: 'left', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1' }}>
              <th style={{ padding: '8px 4px' }}>IP ADDRESS</th>
              <th style={{ padding: '8px 4px' }}>STATUS</th>
              <th style={{ padding: '8px 4px' }}>TRAFFIC SPIKE</th>
              <th style={{ padding: '8px 4px' }}>CRYPTO</th>
            </tr>
          </thead>
          <tbody>
            {nodes.map(n => (
              <tr key={n.id} style={{ borderBottom: '1px dotted rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '8px 4px', color: '#e2e8f0' }}>{n.ip}</td>
                <td style={{ padding: '8px 4px', color: n.status === 'compromised' ? '#ef4444' : (n.status === 'offline' ? '#64748b' : '#10b981') }}>
                  {n.status.toUpperCase()}
                </td>
                <td style={{ padding: '8px 4px', color: n.anomalousTrafficKbps > 1000 ? '#f59e0b' : '#94a3b8' }}>
                  +{n.anomalousTrafficKbps} Kbps
                </td>
                <td style={{ padding: '8px 4px' }}>{n.encryptionProtocols.join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>Automated Firewall Heuristics</div>
        <div style={{ background: '#000', padding: 12, borderRadius: 6, border: '1px solid #1e293b' }}>
          {nodes.map(n => {
            const rule = generateFirewallRule(n);
            let color = '#94a3b8';
            if (rule.startsWith('BLOCK')) color = '#ef4444';
            else if (rule.startsWith('THROTTLE')) color = '#f59e0b';
            
            return (
              <div key={n.id} style={{ fontSize: 11, color, marginBottom: 4 }}>
                &gt; {rule}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default ThreatIntelligencePanel;
