import React, { useState } from 'react';
import { compileAST } from '@/lib/v6PlatformServices';

const s = {
  panel: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, padding: 16,
    color: '#cbd5e1', fontFamily: 'monospace', maxWidth: 600, minHeight: 400
  } as React.CSSProperties,
  header: { fontSize: 16, fontWeight: 800, marginBottom: 16, borderBottom: '1px solid #1e293b', paddingBottom: 8, color: '#38bdf8' } as React.CSSProperties,
};

export function UniversalCompilerDashboard() {
  const [nodes, setNodes] = useState(2500);
  const targets = compileAST(nodes);

  return (
    <div style={s.panel} data-testid="compiler-panel">
      <div style={s.header}>📦 Universal Compiler Export</div>
      <div style={{ marginBottom: 16 }}>
        AST Nodes: {nodes} 
        <input
          id="ast-nodes"
          type="range"
          min="100"
          max="10000"
          value={nodes}
          onChange={e => setNodes(Number(e.target.value))}
          aria-label="AST node count"
          aria-valuenow={nodes}
          aria-valuemin={100}
          aria-valuemax={10000}
          style={{ marginLeft: 10 }}
        />
      </div>

      {targets.map((t, i) => (
        <div key={i} style={{ padding: 10, border: '1px solid #334155', marginBottom: 8, borderRadius: 4, display: 'flex', justifyContent: 'space-between' }}>
          <div>
            <strong style={{ color: '#e2e8f0' }}>{t.target}</strong>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>Size: {(t.sizeKb / 1024).toFixed(2)} MB</div>
          </div>
          <div>
            {t.warnings.map((w, wi) => <div key={wi} style={{ color: '#fbbf24', fontSize: 11 }}>⚠️ {w}</div>)}
            {t.warnings.length === 0 && <span style={{ color: '#34d399', fontSize: 11 }}>✅ Ready</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default UniversalCompilerDashboard;
